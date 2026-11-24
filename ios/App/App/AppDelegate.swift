import UIKit
import AVFoundation
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // The Mushaf recitation and the radio play through the WebView's <audio>.
        // With UIBackgroundModes=audio (Info.plist) they keep playing with the screen locked or
        // the app in the background, and WebKit feeds the lock screen / Control Center
        // "Now Playing" from navigator.mediaSession.
        // The category is .playAndRecord from launch (NQAudioSession, SceneDelegate.swift): with
        // .playback, the voice rooms' microphone could not start (getUserMedia NotReadableError,
        // shown as "used by another app") because WebKit re-activates the session for playback.
        // .defaultToSpeaker keeps recitation on the loudspeaker. The session is only *activated*
        // by WebKit when something actually plays, so opening the app does not interrupt other apps.
        NQAudioSession.apply(voice: false)
        return true
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

    // MARK: Push notifications (@capacitor/push-notifications) — APNs token → JS 'registration'

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
}
