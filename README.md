# MyCube

A cute 2D web prototype of a live hangout app: create an avatar, open a room, and talk in disappearing speech bubbles. If you are not in the room, you do not see the chat. There is no message history.

## Run locally

```bash
cd rooms-app
npm install
node server.js
```

Then open http://localhost:3000

## Try it with two browsers

1. In one window, sign in as `maple`, make a character, create an unlocked room.
2. In another window (or a private window), sign in as `juniper` and add `maple` as a friend.
3. Join maple from the friends list. Walk by clicking the floor. Type a message — it appears over your head and fades away.
4. Create a locked room, share the password, or use Invite so a friend can skip the password.
5. If you own the room, open Shop, buy furniture with the starter 100 coins, and place it on the floor. Click a couch to sit. Use the sandwich and drink buttons for emotes.

In-memory only: rooms, furniture, friends, and coins reset when the server restarts.
