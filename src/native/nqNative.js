// JS handle for the app's own small Android plugin (android/app/src/main/java/
// net/nuralquran/app/NQNativePlugin.java). Not implemented on iOS: callers check
// isAndroid() first. Methods:
//   setBackgroundColor({ color })            window/WebView-parent colour (status-bar strip on old WebViews)
//   openChannelSettings({ channelId? })      the system screen where the user may let a channel bypass DND
//   mediaUpdate({ title, artist, album, playing, position?, duration?, rate?, actions[] })
//   mediaClear()                             stop the media foreground service + notification
//   events: 'mediaAction' { action: play|pause|stop|previoustrack|nexttrack|seekbackward|seekforward|seekto, seekTime? }
import { registerPlugin } from '@capacitor/core';

export const NQNative = registerPlugin('NQNative');
