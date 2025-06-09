export class StudyRoom {
    constructor(state, env) {
      this.state = state;
      this.env = env;
      this.sessions = []; // maintained by getWebSockets now
      this.userStates = {}; // { sessionId: { name, status: {mode, timeLeft, isRunning, tasks} } }
      this.chatHistory = []; // {name, text} limit 50
      this.lastTimestamp = Date.now();
      // Set alarm to clean up or check inactivity
      this.state.blockConcurrencyWhile(async () => {
         const alarm = await this.state.storage.getAlarm();
         if (alarm == null) {
            this.state.storage.setAlarm(Date.now() + 1000 * 60 * 15); // check every 15 mins
         }
      });
    }
  
    async fetch(request) {
       this.lastTimestamp = Date.now();
      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }
  
      const url = new URL(request.url);
      const userName = (url.searchParams.get("name") || "Anonymous").substring(0, 20); // limit name length
      const sessionId = crypto.randomUUID();
  
      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);
  
      this.state.acceptWebSocket(server, [sessionId]); 
      this.userStates[sessionId] = { name: userName, status: {} };
      console.log(`User ${userName} (${sessionId}) connecting to room: ${new URL(request.url).pathname.split('/').pop()}`);
  
      // Send initial state + myId to the NEW user
       server.send(JSON.stringify({
          type: 'INIT',
          payload: {
              users: this.getUsersPayload(sessionId), // pass sessionId to exclude
              chat: this.chatHistory,
              myId: sessionId // Let client know its ID
          }
       }));
        // Broadcast to OTHERS that a new user joined
        this.broadcast({
             type: 'USER_JOINED',
             payload: { id: sessionId, name: userName, status: {} }
        }, [sessionId]); 
  
      return new Response(null, { status: 101, webSocket: client });
    }
  
     getUsersPayload(excludeId = null) {
         const users = {};
          this.state.getWebSockets().forEach(session => {
             const tag = session.tags[0];
             if (tag && tag !== excludeId && this.userStates[tag]) {
                  users[tag] = {
                    name: this.userStates[tag].name,
                    status: this.userStates[tag].status || {}
                  };
             }
        });
        return users;
     }
  
      broadcast(message, excludeTags = []) {
          const data = JSON.stringify(message);
          // state.getWebSockets() is the source of truth for active connections
          const sessionsToNotify = this.state.getWebSockets().filter(
               session => session.tags[0] && !excludeTags.includes(session.tags[0])
          );
          sessionsToNotify.forEach(session => {
              try { session.send(data); } 
              catch (e) { console.error("Failed to send to session", session.tags[0], e); }
          });
      }
  
      async webSocketMessage(webSocket, message) {
          this.lastTimestamp = Date.now();
          const sessionId = webSocket.tags[0];
          if (!sessionId || !this.userStates[sessionId]) return; // Ignore if state missing
          const userName = this.userStates[sessionId].name;
           try {
               const data = JSON.parse(message);
                switch (data.type) {
                  case 'CHAT':
                      const chatText = String(data.payload.text || '').substring(0, 200); 
                      if (!chatText) return;
                      const chatMessage = { name: userName, text: chatText };
                      this.chatHistory.push(chatMessage);
                       if (this.chatHistory.length > 50) this.chatHistory.shift();
                      this.broadcast({ type: 'CHAT', payload: chatMessage }); // Broadcast to ALL
                      break;
                  case 'STATUS_UPDATE':
                       this.userStates[sessionId].status = data.payload;
                       this.broadcast({ // Broadcast to OTHERS
                            type: 'STATUS_UPDATE',
                            payload: { id: sessionId, name: userName, status: data.payload }
                       }, [sessionId]);
                      break;
                   case 'PING':
                       webSocket.send(JSON.stringify({type: 'PONG'}));
                       break;
                  default:
                       console.warn(`Unknown message type from ${sessionId}: ${data.type}`);
              }
           } catch (e) {
              console.error(`Error handling message from ${sessionId}:`, e, message);
               try { webSocket.send(JSON.stringify({ type: 'ERROR', payload: 'Invalid message format' })); } catch {}
           }
      }
  
      async webSocketClose(webSocket, code, reason, wasClean) {
          const sessionId = webSocket.tags[0];
           if (!sessionId) return;
           const userName = this.userStates[sessionId]?.name || 'Unknown';
          console.log(`User ${userName} (${sessionId}) disconnected. Code: ${code}`);
          delete this.userStates[sessionId];
           // Only broadcast if there are others left
           if (this.state.getWebSockets().length > 0) {
              this.broadcast({ type: 'USER_LEFT', payload: { id: sessionId } });
           }
           // Check if room is empty, maybe reset alarm?
           if (this.state.getWebSockets().length === 0) {
               console.log("Room is empty.");
                this.lastTimestamp = Date.now(); // Reset timestamp when last person leaves
           }
      }
  
      async webSocketError(webSocket, error) {
         console.error(`WebSocket error for session ${webSocket.tags[0]}:`, error);
      }
      
      async alarm() {
         const sessionCount = this.state.getWebSockets().length;
         // If room empty and inactive for 1 hour, clear chat
         if (sessionCount === 0 && Date.now() - this.lastTimestamp > 1000 * 60 * 60 * 1) {
             if (this.chatHistory.length > 0) {
                console.log("Clearing chat history due to inactivity.");
                this.chatHistory = [];
             }
         }
         // Schedule next alarm check
          this.state.storage.setAlarm(Date.now() + 1000 * 60 * 15); 
      }
  }