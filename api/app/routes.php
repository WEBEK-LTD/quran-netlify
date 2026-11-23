<?php
declare(strict_types=1);

use NQ\Controllers\AdminController as Admin;
use NQ\Controllers\AiController as Ai;
use NQ\Controllers\AuthController as AuthC;
use NQ\Controllers\AvatarController as Avatar;
use NQ\Controllers\GoogleController as Google;
use NQ\Controllers\GroupController as Group;
use NQ\Controllers\MeController as Me;
use NQ\Controllers\PublicController as Pub;
use NQ\Controllers\RiwayatController as Riwayat;
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
};
