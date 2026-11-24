import UIKit
import AVFoundation
import AuthenticationServices
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = NQBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

// MARK: - App-local plugins

/// The bridge view controller with the app's own plugins registered.
class NQBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NQAudioPlugin())
        bridge?.registerPluginInstance(NQAppleSignInPlugin())
    }
}

/// Voice rooms: the app's audio session is .playback (recitation / radio keep playing with the
/// screen locked, see AppDelegate). Speaking in a room needs .playAndRecord while the microphone
/// is on; afterwards we go back to .playback so the Mushaf audio behaves as before.
///   JS: registerPlugin('NQAudio').setMode({ mode: 'voice' | 'media' })   (src/community/audioMode.js)
@objc(NQAudioPlugin)
public class NQAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NQAudioPlugin"
    public let jsName = "NQAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setMode", returnType: CAPPluginReturnPromise)
    ]

    @objc func setMode(_ call: CAPPluginCall) {
        let mode = call.getString("mode") ?? "media"
        DispatchQueue.main.async {
            let session = AVAudioSession.sharedInstance()
            do {
                if mode == "voice" {
                    try session.setCategory(.playAndRecord, mode: .voiceChat,
                                            options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP])
                    try session.setActive(true, options: [])
                } else {
                    // same as AppDelegate at launch; WebKit re-activates it when audio plays
                    try session.setCategory(.playback, mode: .spokenAudio, options: [])
                }
                call.resolve()
            } catch {
                NSLog("[NurAlQuran] audio mode \(mode): \(error)")
                call.reject("audio_session", nil, error)
            }
        }
    }
}

/// Sign in with Apple (App Store guideline 4.8), with the system sheet — no third-party plugin.
///   JS: registerPlugin('NQAppleSignIn').signIn({ nonce? })   (src/native/appleSignIn.js)
///   → { identityToken, authorizationCode, user, email?, givenName?, familyName? }
///   rejects with code "cancelled" (the visitor closed the sheet) or "failed".
/// The API verifies the identity token (POST /v1/auth/apple). Needs the Sign in with Apple entitlement (App.entitlements).
@objc(NQAppleSignInPlugin)
public class NQAppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "NQAppleSignInPlugin"
    public let jsName = "NQAppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private var controller: ASAuthorizationController?

    @objc func signIn(_ call: CAPPluginCall) {
        let nonce = call.getString("nonce")
        DispatchQueue.main.async {
            if let previous = self.pendingCall {
                previous.reject("Another sign-in started", "cancelled")
            }
            self.pendingCall = call
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            if let nonce = nonce, !nonce.isEmpty {
                request.nonce = nonce   // SHA-256 of the raw nonce the API receives
            }
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.controller = controller   // keep it alive until the sheet answers
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if let window = bridge?.webView?.window {
            return window
        }
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        if let window = scenes.flatMap({ $0.windows }).first(where: { $0.isKeyWindow }) ?? scenes.first?.windows.first {
            return window
        }
        return ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = finish() else { return }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            call.reject("Sign in with Apple returned no identity token", "failed")
            return
        }
        var result: [String: Any] = [:]
        result["identityToken"] = identityToken
        result["user"] = credential.user
        if let codeData = credential.authorizationCode, let code = String(data: codeData, encoding: .utf8) {
            result["authorizationCode"] = code
        }
        // Apple shares the e-mail and name only on the first sign-in with this app
        if let email = credential.email {
            result["email"] = email
        }
        if let given = credential.fullName?.givenName {
            result["givenName"] = given
        }
        if let family = credential.fullName?.familyName {
            result["familyName"] = family
        }
        call.resolve(result)
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = finish() else { return }
        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            call.reject("Sign in with Apple was cancelled", "cancelled")
        } else {
            NSLog("[NurAlQuran] Sign in with Apple: \(error)")
            call.reject(error.localizedDescription, "failed", error)
        }
    }

    private func finish() -> CAPPluginCall? {
        let call = pendingCall
        pendingCall = nil
        controller = nil
        return call
    }
}
