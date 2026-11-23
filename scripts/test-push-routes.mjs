// Unit tests for community push deep links (src/native/pushRoutes.js).
// Run with: npm run test:native
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeForPush, flattenPushData } from '../src/native/pushRoutes.js';

test('FCM data (flat strings) → screens', () => {
  assert.equal(routeForPush({ type: 'room_opened', room_id: '12' }), '/rooms/12');
  assert.equal(routeForPush({ type: 'group_room', room_id: '7', group_id: '3' }), '/rooms/7');
  assert.equal(routeForPush({ type: 'speak_invite', room_id: '9' }), '/rooms/9');
  assert.equal(routeForPush({ type: 'reminder_soon', room_id: '4', scheduled_at: '2026-11-23T20:00:00Z' }), '/rooms/4');
  assert.equal(routeForPush({ type: 'dm', conversation_id: '55', user_id: '8' }), '/messages/55');
  assert.equal(routeForPush({ type: 'friend_request', user_id: '8' }), '/people/8');
  assert.equal(routeForPush({ type: 'friend_accept', user_id: '8' }), '/people/8');
  assert.equal(routeForPush({ type: 'join_request', group_id: '3' }), '/groups/3');
  assert.equal(routeForPush({ type: 'suspension' }), '/notifications');
  assert.equal(routeForPush({ type: 'reminder_cancelled', room_id: '4' }), '/notifications');
});

test('APNs payload (top-level type, nested data) is flattened', () => {
  const apns = { aps: { alert: { title: 'x', body: 'y' } }, type: 'dm', data: { conversation_id: 77, user_id: 2 } };
  assert.equal(routeForPush(apns), '/messages/77');
  assert.equal(flattenPushData(apns).aps, undefined);
  assert.equal(routeForPush({ type: 'room_scheduled', data: '{"room_id":5}' }), '/rooms/5');
});

test('unsafe or missing ids never build a path', () => {
  assert.equal(routeForPush({ type: 'room_opened', room_id: '../admin' }), '/rooms');
  assert.equal(routeForPush({ type: 'dm' }), '/messages');
  assert.equal(routeForPush({ type: 'something_new' }), '/notifications');
  assert.equal(routeForPush({ path: '/reader' }), null);
  assert.equal(routeForPush(null), null);
});
