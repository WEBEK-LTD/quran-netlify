<?php
declare(strict_types=1);

use NQ\Controllers\AdminCommunityController as AdminCommunity;
use NQ\Controllers\AdminController as Admin;
use NQ\Controllers\AiController as Ai;
use NQ\Controllers\AuthController as AuthC;
use NQ\Controllers\AvatarController as Avatar;
use NQ\Controllers\CommunityController as Community;
use NQ\Controllers\CommunityGroupController as CGroup;
use NQ\Controllers\GoogleController as Google;
use NQ\Controllers\GroupController as Group;
use NQ\Controllers\MeController as Me;
use NQ\Controllers\MessagesController as Dm;
use NQ\Controllers\PublicController as Pub;
use NQ\Controllers\RadioController as Radio;
use NQ\Controllers\RiwayatController as Riwayat;
use NQ\Controllers\RoomController as Room;
use NQ\Controllers\SupportController as Support;
use NQ\Core\Router;

/** All routes are relative to /v1. */
return static function (Router $r): void {
    // Public
    $r->get('/health', [Pub::class, 'health']);
    $r->get('/settings/public', [Pub::class, 'settings']);
    $r->get('/broadcasts', [Pub::class, 'broadcasts']);
    $r->get('/leaderboard', [Pub::class, 'leaderboard']);
    $r->post('/presence', [Pub::class, 'presence']);
    $r->get('/riwayat/text/{edition}/{surah}', [Riwayat::class, 'text']);
    $r->get('/riwayat/audio', [Riwayat::class, 'audio']);
    $r->get('/radio', [Radio::class, 'index']);

    // Auth
    $r->post('/auth/signup', [AuthC::class, 'signup']);
    $r->post('/auth/login', [AuthC::class, 'login']);
    $r->post('/auth/logout', [AuthC::class, 'logout']);
    $r->get('/auth/me', [AuthC::class, 'me']);
    $r->post('/auth/verify-email', [AuthC::class, 'verifyEmail']);
    $r->post('/auth/resend-verification', [AuthC::class, 'resendVerification']);
    $r->post('/auth/forgot-password', [AuthC::class, 'forgotPassword']);
    $r->post('/auth/reset-password', [AuthC::class, 'resetPassword']);
    $r->post('/auth/change-password', [AuthC::class, 'changePassword']);
    $r->patch('/auth/profile', [AuthC::class, 'profile']);
    $r->delete('/auth/account', [AuthC::class, 'deleteAccount']);
    $r->get('/auth/export', [AuthC::class, 'export']);
    $r->get('/auth/google/start', [Google::class, 'start']);
    $r->get('/auth/google/callback', [Google::class, 'callback']);

    // Personal data
    $r->post('/me/avatar', [Avatar::class, 'upload']);
    $r->delete('/me/avatar', [Avatar::class, 'remove']);
    $r->get('/avatars/{file}', [Avatar::class, 'serve']);
    $r->get('/me/bookmarks', [Me::class, 'bookmarks']);
    $r->put('/me/bookmarks', [Me::class, 'replaceBookmarks']);
    $r->post('/me/bookmarks', [Me::class, 'addBookmark']);
    $r->delete('/me/bookmarks/{surah}/{ayah}', [Me::class, 'deleteBookmark']);
    $r->get('/me/notes', [Me::class, 'notes']);
    $r->put('/me/notes/{surah}/{ayah}', [Me::class, 'putNote']);
    $r->delete('/me/notes/{surah}/{ayah}', [Me::class, 'deleteNote']);
    $r->get('/me/progress', [Me::class, 'progress']);
    $r->put('/me/progress', [Me::class, 'putProgress']);
    $r->post('/me/reading', [Me::class, 'logReading']);
    $r->get('/me/stats', [Me::class, 'stats']);
    $r->get('/me/hifz', [Me::class, 'hifz']);
    $r->put('/me/hifz', [Me::class, 'putHifz']);
    $r->get('/me/khatmat', [Me::class, 'khatmat']);
    $r->post('/me/khatmat', [Me::class, 'createKhatma']);
    $r->patch('/me/khatmat/{id}', [Me::class, 'updateKhatma']);
    $r->delete('/me/khatmat/{id}', [Me::class, 'deleteKhatma']);

    // Group khatma (static paths before /{code})
    $r->post('/groups', [Group::class, 'create']);
    $r->get('/groups/mine', [Group::class, 'mine']);
    $r->get('/groups/public', [Group::class, 'publicRooms']);
    $r->get('/groups/{code}', [Group::class, 'show']);
    $r->patch('/groups/{code}', [Group::class, 'update']);
    $r->delete('/groups/{code}', [Group::class, 'destroy']);
    $r->post('/groups/{code}/new-round', [Group::class, 'newRound']);
    $r->delete('/groups/{code}/membership', [Group::class, 'leave']);
    $r->post('/groups/{code}/parts/{i}/claim', [Group::class, 'claim']);
    $r->delete('/groups/{code}/parts/{i}/claim', [Group::class, 'release']);
    $r->post('/groups/{code}/parts/{i}/done', [Group::class, 'done']);

    // ── Voice rooms & community (docs/API.md «Rooms & community») ──
    $r->get('/me/community-profile', [Community::class, 'myProfile']);
    $r->patch('/me/community-profile', [Community::class, 'updateMyProfile']);
    $r->get('/me/friend-requests', [Community::class, 'friendRequests']);
    $r->post('/me/friend-requests/{id}/accept', [Community::class, 'acceptFriend']);
    $r->post('/me/friend-requests/{id}/decline', [Community::class, 'declineFriend']);
    $r->get('/me/friends/activity', [Community::class, 'friendsActivity']);
    $r->delete('/me/followers/{id}', [Community::class, 'removeFollower']);
    $r->get('/me/blocks', [Community::class, 'blocks']);
    $r->get('/me/social/{kind}', [Community::class, 'myList']);          // friends | followers | following | clappers
    $r->post('/me/devices', [Community::class, 'registerDevice']);
    $r->delete('/me/devices', [Community::class, 'removeDevice']);
    $r->get('/me/notifications', [Community::class, 'notifications']);
    $r->post('/me/notifications/read', [Community::class, 'readNotifications']);
    $r->get('/me/notification-prefs', [Community::class, 'notificationPrefs']);
    $r->put('/me/notification-prefs', [Community::class, 'saveNotificationPrefs']);
    $r->get('/me/conversations', [Dm::class, 'index']);
    $r->post('/me/conversations', [Dm::class, 'start']);
    $r->get('/me/conversations/{id}/messages', [Dm::class, 'messages']);
    $r->post('/me/conversations/{id}/messages', [Dm::class, 'send']);
    $r->post('/me/conversations/{id}/read', [Dm::class, 'markRead']);
    $r->delete('/me/conversations/{id}/messages/{mid}', [Dm::class, 'deleteMessage']);
    $r->delete('/me/conversations/{id}', [Dm::class, 'deleteConversation']);

    $r->get('/people', [Community::class, 'search']);
    $r->get('/people/{id}', [Community::class, 'show']);
    $r->post('/people/{id}/friend-request', [Community::class, 'friendRequest']);
    $r->delete('/people/{id}/friend-request', [Community::class, 'cancelFriendRequest']);
    $r->delete('/people/{id}/friend', [Community::class, 'unfriend']);
    $r->post('/people/{id}/follow', [Community::class, 'follow']);
    $r->delete('/people/{id}/follow', [Community::class, 'unfollow']);
    $r->post('/people/{id}/block', [Community::class, 'block']);
    $r->delete('/people/{id}/block', [Community::class, 'unblock']);
    $r->get('/people/{id}/{kind}', [Community::class, 'lists']);         // friends | followers | following | clappers (friends only)

    $r->get('/reports/reasons', [Community::class, 'reportReasons']);
    $r->post('/reports', [Community::class, 'report']);

    $r->get('/rooms', [Room::class, 'index']);
    $r->post('/rooms', [Room::class, 'create']);
    $r->get('/rooms/{id}', [Room::class, 'show']);
    $r->patch('/rooms/{id}', [Room::class, 'update']);
    $r->delete('/rooms/{id}', [Room::class, 'close']);
    $r->post('/rooms/{id}/start', [Room::class, 'start']);
    $r->post('/rooms/{id}/join', [Room::class, 'join']);
    $r->post('/rooms/{id}/leave', [Room::class, 'leave']);
    $r->get('/rooms/{id}/participants', [Room::class, 'participants']);
    $r->post('/rooms/{id}/hand', [Room::class, 'raiseHand']);
    $r->delete('/rooms/{id}/hand', [Room::class, 'lowerHand']);
    $r->post('/rooms/{id}/speakers/{uid}', [Room::class, 'addSpeaker']);
    $r->delete('/rooms/{id}/speakers/{uid}', [Room::class, 'removeSpeaker']);
    $r->post('/rooms/{id}/moderators/{uid}', [Room::class, 'addModerator']);
    $r->delete('/rooms/{id}/moderators/{uid}', [Room::class, 'removeModerator']);
    $r->post('/rooms/{id}/participants/{uid}/mute', [Room::class, 'mute']);
    $r->post('/rooms/{id}/participants/{uid}/kick', [Room::class, 'kick']);
    $r->put('/rooms/{id}/page', [Room::class, 'setPage']);
    $r->get('/rooms/{id}/chat', [Room::class, 'chat']);
    $r->post('/rooms/{id}/chat', [Room::class, 'postChat']);
    $r->post('/rooms/{id}/reactions', [Room::class, 'react']);
    $r->post('/rooms/{id}/reminder', [Room::class, 'remind']);
    $r->delete('/rooms/{id}/reminder', [Room::class, 'unremind']);
    $r->post('/livekit/webhook', [Room::class, 'webhook']);

    $r->get('/community/groups', [CGroup::class, 'discover']);
    $r->post('/community/groups', [CGroup::class, 'create']);
    $r->get('/community/groups/mine', [CGroup::class, 'mine']);
    $r->get('/community/groups/{id}', [CGroup::class, 'show']);
    $r->patch('/community/groups/{id}', [CGroup::class, 'update']);
    $r->delete('/community/groups/{id}', [CGroup::class, 'destroy']);
    $r->post('/community/groups/{id}/join', [CGroup::class, 'join']);
    $r->delete('/community/groups/{id}/membership', [CGroup::class, 'leave']);
    $r->get('/community/groups/{id}/members', [CGroup::class, 'members']);
    $r->delete('/community/groups/{id}/members/{uid}', [CGroup::class, 'kick']);
    $r->get('/community/groups/{id}/requests', [CGroup::class, 'requests']);
    $r->post('/community/groups/{id}/requests/{uid}/accept', [CGroup::class, 'acceptRequest']);
    $r->post('/community/groups/{id}/requests/{uid}/decline', [CGroup::class, 'declineRequest']);
    $r->post('/community/groups/{id}/invites', [CGroup::class, 'invite']);
    $r->put('/community/groups/{id}/moderators/{uid}', [CGroup::class, 'setModerator']);
    $r->delete('/community/groups/{id}/moderators/{uid}', [CGroup::class, 'removeModerator']);
    $r->post('/community/groups/{id}/transfer', [CGroup::class, 'transfer']);
    $r->post('/community/groups/{id}/follow', [CGroup::class, 'follow']);
    $r->delete('/community/groups/{id}/follow', [CGroup::class, 'unfollow']);
    $r->post('/community/groups/{id}/photo', [CGroup::class, 'uploadPhoto']);
    $r->delete('/community/groups/{id}/photo', [CGroup::class, 'removePhoto']);

    // Support
    $r->get('/support/tickets', [Support::class, 'tickets']);
    $r->post('/support/tickets', [Support::class, 'create']);
    $r->get('/support/tickets/{id}/messages', [Support::class, 'messages']);
    $r->post('/support/tickets/{id}/messages', [Support::class, 'post']);

    // AI
    $r->post('/ai/chat', [Ai::class, 'chat']);

    // Admin
    $r->get('/admin/stats', [Admin::class, 'stats']);
    $r->get('/admin/users', [Admin::class, 'users']);
    $r->patch('/admin/users/{id}', [Admin::class, 'updateUser']);
    $r->post('/admin/users/{id}/ban', [Admin::class, 'ban']);
    $r->delete('/admin/users/{id}/ban', [Admin::class, 'unban']);
    $r->post('/admin/users/{id}/message', [Admin::class, 'messageUser']);
    $r->get('/admin/broadcasts', [Admin::class, 'broadcasts']);
    $r->post('/admin/broadcasts', [Admin::class, 'createBroadcast']);
    $r->delete('/admin/broadcasts/{id}', [Admin::class, 'deleteBroadcast']);
    $r->get('/admin/settings', [Admin::class, 'settings']);
    $r->put('/admin/settings', [Admin::class, 'saveSettings']);
    $r->get('/admin/integrations', [Admin::class, 'integrations']);
    $r->put('/admin/integrations', [Admin::class, 'saveIntegrations']);
    $r->post('/admin/integrations/test', [Admin::class, 'testIntegration']);
    $r->get('/admin/tickets', [Admin::class, 'tickets']);
    $r->get('/admin/tickets/{id}/messages', [Admin::class, 'ticketMessages']);
    $r->post('/admin/tickets/{id}/messages', [Admin::class, 'postTicketMessage']);
    $r->patch('/admin/tickets/{id}', [Admin::class, 'updateTicket']);
    $r->get('/admin/unread', [Admin::class, 'unread']);
    $r->get('/admin/log', [Admin::class, 'log']);
    $r->get('/admin/community/reports', [AdminCommunity::class, 'reports']);
    $r->get('/admin/community/reports/{id}', [AdminCommunity::class, 'report']);
    $r->post('/admin/community/reports/{id}/decision', [AdminCommunity::class, 'decide']);
    $r->get('/admin/community/suspensions', [AdminCommunity::class, 'suspensions']);
    $r->post('/admin/community/suspensions/{id}/reactivate', [AdminCommunity::class, 'reactivate']);
    $r->post('/admin/community/suspensions/{id}/lock', [AdminCommunity::class, 'lock']);
    $r->post('/admin/community/users/{id}/suspend', [AdminCommunity::class, 'suspendUser']);
    $r->patch('/admin/community/users/{id}', [AdminCommunity::class, 'correctUser']);
    $r->delete('/admin/community/users/{id}/photo', [AdminCommunity::class, 'removeUserPhoto']);
    $r->delete('/admin/community/groups/{id}/photo', [AdminCommunity::class, 'removeGroupPhoto']);
    $r->delete('/admin/community/groups/{id}', [AdminCommunity::class, 'deleteGroup']);
    $r->get('/admin/community/rooms', [AdminCommunity::class, 'rooms']);
    $r->delete('/admin/community/rooms/{id}', [AdminCommunity::class, 'closeRoom']);
    $r->get('/admin/community/dictionary', [AdminCommunity::class, 'dictionary']);
    $r->post('/admin/community/dictionary', [AdminCommunity::class, 'dictionaryCreate']);
    $r->post('/admin/community/dictionary/test', [AdminCommunity::class, 'dictionaryTest']);
    $r->patch('/admin/community/dictionary/{id}', [AdminCommunity::class, 'dictionaryUpdate']);
    $r->delete('/admin/community/dictionary/{id}', [AdminCommunity::class, 'dictionaryDelete']);
    $r->get('/admin/community/settings', [AdminCommunity::class, 'settings']);
    $r->put('/admin/community/settings', [AdminCommunity::class, 'saveSettings']);
};
