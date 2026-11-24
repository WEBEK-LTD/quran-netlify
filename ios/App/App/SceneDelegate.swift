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

/// The app's audio session. The category is always .playAndRecord — never .playback — so the
/// voice rooms' microphone can start at any moment (with .playback, WebKit re-activating the
/// session for media made getUserMedia fail with NotReadableError). Only the options change:
///   media (listening, recitation, radio): speaker, AirPlay, Bluetooth A2DP (full-quality output);
///   voice (my microphone is on): adds Bluetooth HFP so a headset's microphone can be used.
/// HFP is left out while only listening: when a headset supports both profiles iOS prefers HFP,
/// which would play the recitation in low "call" quality. Mode .default in both: WebKit's capture
/// does its own voice processing (echo cancellation).
enum NQAudioSession {
    static func apply(voice: Bool) {
        let session = AVAudioSession.sharedInstance()
        var options: AVAudioSession.CategoryOptions = [.defaultToSpeaker, .allowBluetoothA2DP, .allowAirPlay]
        if voice {
            options.insert(.allowBluetooth)   // HFP (renamed .allowBluetoothHFP in newer SDKs; same value)
        }
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: options)
            if voice {
                try session.setActive(true, options: [])
            }
        } catch {
            NSLog("[NurAlQuran] audio session (voice: \(voice)): \(error)")
        }
    }
}

/// Voice rooms: switches the session options around the microphone (see NQAudioSession).
///   JS: registerPlugin('NQAudio').setMode({ mode: 'voice' | 'media' })   (src/community/audioMode.js)
/// Always resolves: the microphone must be tried even if the session change failed (logged).
@objc(NQAudioPlugin)
public class NQAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NQAudioPlugin"
    public let jsName = "NQAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestMic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "diagnose", returnType: CAPPluginReturnPromise)
    ]

    /// Asks iOS for the microphone permission itself (the system prompt), before WebKit captures.
    @objc func requestMic(_ call: CAPPluginCall) {
        let done: (Bool) -> Void = { granted in
            DispatchQueue.main.async { call.resolve(["granted": granted, "permission": NQAudioPlugin.permission()]) }
        }
        if #available(iOS 17.0, *) {
            AVAudioApplication.requestRecordPermission(completionHandler: done)
        } else {
            AVAudioSession.sharedInstance().requestRecordPermission(done)
        }
    }

    /// The audio session as iOS sees it — shown in the room's microphone error sheet.
    @objc func diagnose(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let s = AVAudioSession.sharedInstance()
            call.resolve([
                "permission": NQAudioPlugin.permission(),
                "category": s.category.rawValue,
                "mode": s.mode.rawValue,
                "inputAvailable": s.isInputAvailable,
                "inputs": s.availableInputs?.map { $0.portType.rawValue }.joined(separator: ",") ?? "",
                "route": s.currentRoute.inputs.map { $0.portType.rawValue }.joined(separator: ","),
                "otherAudio": s.isOtherAudioPlaying,
            ])
        }
    }

    static func permission() -> String {
        if #available(iOS 17.0, *) {
            switch AVAudioApplication.shared.recordPermission {
            case .granted: return "granted"
            case .denied: return "denied"
            case .undetermined: return "undetermined"
            @unknown default: return "unknown"
            }
        } else {
            switch AVAudioSession.sharedInstance().recordPermission {
            case .granted: return "granted"
            case .denied: return "denied"
            case .undetermined: return "undetermined"
            @unknown default: return "unknown"
            }
        }
    }

    @objc func setMode(_ call: CAPPluginCall) {
        let mode = call.getString("mode") ?? "media"
        DispatchQueue.main.async {
            NQAudioSession.apply(voice: mode == "voice")
            call.resolve()
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
