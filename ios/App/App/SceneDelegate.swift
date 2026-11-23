import UIKit
import AVFoundation
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
