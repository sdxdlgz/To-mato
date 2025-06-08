 // --- State ---
 let tasks = [];
 let currentPriority = 'medium';
 let timerInterval = null;
 let timeLeft = 25 * 60; // seconds
 let isRunning = false;
 let currentMode = 'work'; // 'work' or 'break'
 let workDuration = 25 * 60;
 let breakDuration = 5 * 60;
 let completedCycles = 0;
 let currentTheme = 'default';
 let myName = '';
 let currentRoomPin = '';
 let taskStats = '0/0';

// --- WebSocket State ---
let ws = null;
let roomUsers = {}; // { userId: { name, status: {mode, timeLeft, isRunning, tasks} } }
const PING_INTERVAL = 45000; // Ping server every 45s to keep connection alive
let pingIntervalId = null;
let statusUpdateTimeoutId = null; // Debounce timer

 // --- DOM Elements ---
 const taskForm = document.getElementById('add-task-form');
 const taskInput = document.getElementById('task-input');
 const taskList = document.getElementById('task-list');
 const priorityBtns = document.querySelectorAll('.priority-btn');
 const todoStatsEl = document.getElementById('todo-stats');
 const emptyStateEl = document.getElementById('empty-state');
 const timerDisplay = document.getElementById('timer-display');
 const startPauseBtn = document.getElementById('start-pause-btn');
 const resetBtn = document.getElementById('reset-btn');
 const skipBtn = document.getElementById('skip-btn');
 const cycleCountEl = document.getElementById('cycle-count');
 const timerModeTitleEl = document.getElementById('timer-mode-title');
 const progressFill = document.getElementById('progress-fill');
 const workEndSound = document.getElementById('work-end-sound');
 const breakEndSound = document.getElementById('break-end-sound');
 const settingsModal = document.getElementById('settings-modal');
 const settingsOpenBtn = document.getElementById('settings-open-btn');
 const settingsSaveBtn = document.getElementById('settings-save-btn');
 const settingsCancelBtn = document.getElementById('settings-cancel-btn');
 const workDurationInput = document.getElementById('work-duration');
 const breakDurationInput = document.getElementById('break-duration');
 const infoWorkEl = document.getElementById('info-work');
 const infoBreakEl = document.getElementById('info-break');
 const themeSelectors = document.querySelectorAll('.theme-selector span');
 const addTaskBtn = document.getElementById('add-task-btn');
// ROOM DOM
 const joinModal = document.getElementById('join-modal');
 const joinForm = document.getElementById('join-form');
 const joinBtn = document.getElementById('join-btn');
 const leaveBtn = document.getElementById('leave-btn');
 const joinCancelBtn = document.getElementById('join-cancel-btn');
 const userNameInput = document.getElementById('user-name');
 const roomPinInput = document.getElementById('room-pin');
 const roomStatusEl = document.getElementById('room-status');
 const roomInfoEl = document.getElementById('room-info');
 const roomPanel = document.getElementById('room-panel');
 const userListEl = document.getElementById('user-list');
 const userCountEl = document.getElementById('user-count');
 const chatBox = document.getElementById('chat-box');
 const chatForm = document.getElementById('chat-form');
 const chatInput = document.getElementById('chat-input');


// --- Helper Functions ---
 const escapeHTML = (str) => {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
 };
 const formatTime = (seconds) => {
     if (isNaN(seconds) || seconds < 0) return "00:00";
      const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
      const secs = (seconds % 60).toString().padStart(2, '0');
      return `${minutes}:${secs}`;
 };
 const playSound = (audioEl) => {
    audioEl.currentTime = 0;
    audioEl.play().catch(e => console.log("Audio play prevented: ", e));
};

// --- TODO Functions ---
const saveTasks = () => localStorage.setItem('tasks', JSON.stringify(tasks));
const renderTasks = () => {
     taskList.innerHTML = '';
     const completedCount = tasks.filter(task => task.completed).length;
     taskStats = `${completedCount}/${tasks.length}`;
     todoStatsEl.innerHTML = `<span class="icon">✔️</span> 已完成 ${taskStats} 项任务`;
     emptyStateEl.style.display = tasks.length === 0 ? 'block' : 'none';
     tasks.sort((a, b) => {
          if (a.completed !== b.completed) return a.completed - b.completed; 
          const priorityOrder = { high: 1, medium: 2, low: 3 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
     }).forEach(task => {
         const li = document.createElement('li');
         li.innerHTML = `
             <input type="checkbox" ${task.completed ? 'checked' : ''} data-id="${task.id}">
             <span class="priority-dot ${task.priority}" title="${task.priority} priority"></span>
             <span class="task-text ${task.completed ? 'completed' : ''}">${escapeHTML(task.text)}</span>
             <button class="delete-btn" data-id="${task.id}" title="删除任务">&times;</button>
         `;
         taskList.appendChild(li);
     });
     scheduleStatusUpdate(); // EVENT: Notify room when tasks change
 };
 const addTask = (e) => {
    e.preventDefault();
    const text = taskInput.value.trim();
    if (!text) return;
    tasks.push({ id: Date.now(), text: text, priority: currentPriority, completed: false });
    taskInput.value = '';
    addTaskBtn.disabled = true;
    saveTasks();
    renderTasks();
 };
 const handleTaskAction = (e) => {
     const id = parseInt(e.target.dataset.id);
      if (isNaN(id)) return;
      if (e.target.type === 'checkbox') {
          const task = tasks.find(t => t.id === id);
          if (task) { task.completed = e.target.checked; saveTasks(); renderTasks(); }
     } else if (e.target.classList.contains('delete-btn')) {
          tasks = tasks.filter(t => t.id !== id); saveTasks(); renderTasks();
     }
 };
 const setPriority = (e) => {
    if(!e.target.classList.contains('priority-btn')) return;
    priorityBtns.forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
    currentPriority = e.target.dataset.priority;
 };

// --- Pomodoro Functions ---
const saveTimerSettings = () => {
    localStorage.setItem('timerSettings', JSON.stringify({ workDuration, breakDuration, completedCycles, currentTheme }));
};
 const updateDisplay = () => {
     timerDisplay.textContent = formatTime(timeLeft);
     cycleCountEl.textContent = completedCycles;
     timerModeTitleEl.textContent = currentMode === 'work' ? '专注时间 ⏳' : '休息一下 ☕';
     skipBtn.textContent = currentMode === 'work' ? '☕ 休息' : '👩‍💻 工作' ;
     infoWorkEl.textContent = workDuration / 60;
     infoBreakEl.textContent = breakDuration / 60;
     const totalDuration = currentMode === 'work' ? workDuration : breakDuration;
     const progress = (totalDuration === 0 || timeLeft < 0) ? 0 : ((totalDuration - timeLeft) / totalDuration) * 100;
     progressFill.style.width = `${progress}%`;
     let title = '待办与专注自习室';
      if (isRunning) title = `${formatTime(timeLeft)} - ${currentMode === 'work' ? '专注中' : '休息中'} | ${title}`;
      else if (startPauseBtn.textContent === '▶ 继续') title = `已暂停 | ${title}`;
      document.title = title;
      // <<< IMPORTANT: REMOVED scheduleStatusUpdate() from here to save DO requests >>>
 };

 const switchMode = () => {
    clearInterval(timerInterval);
    isRunning = false;
    startPauseBtn.textContent = '▶ 继续';
    resetBtn.disabled = false; skipBtn.disabled = false; settingsOpenBtn.disabled = false;
    if (currentMode === 'work') {
        completedCycles++; currentMode = 'break'; timeLeft = breakDuration; playSound(workEndSound);
    } else {
        currentMode = 'work'; timeLeft = workDuration; playSound(breakEndSound);
    }
    saveTimerSettings(); 
    updateDisplay();
    scheduleStatusUpdate(); // EVENT: Mode changed
    setTimeout(() => { if (!isRunning) startTimer(); }, 1500);
 };
const tick = () => {
     if (timeLeft > 0) { 
        timeLeft--; 
        updateDisplay(); // Only updates local UI now
     } else { 
        switchMode(); 
     }
};
const startTimer = () => {
    if(isRunning) return;
     if (timeLeft <= 0) { timeLeft = (currentMode === 'work') ? workDuration : breakDuration; updateDisplay();
        if (timeLeft <=0) return; 
     }
    isRunning = true;
    startPauseBtn.textContent = '⏸ 暂停';
    resetBtn.disabled = true; skipBtn.disabled = true; settingsOpenBtn.disabled = true;
    if(timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(tick, 1000);
    updateDisplay();
    scheduleStatusUpdate(); // EVENT: Timer Started
};
 const pauseTimer = () => {
    if(!isRunning) return;
     clearInterval(timerInterval);
     timerInterval = null; isRunning = false;
     startPauseBtn.textContent = '▶ 继续';
     resetBtn.disabled = false; skipBtn.disabled = false; settingsOpenBtn.disabled = false;
      updateDisplay();
      scheduleStatusUpdate(); // EVENT: Timer Paused
 };
 const toggleTimer = () => {
     workEndSound.load(); breakEndSound.load();
     if (isRunning) pauseTimer(); else startTimer();
 };
 const resetTimer = (applySettings = false) => {
    pauseTimer(); 
    currentMode = 'work'; timeLeft = workDuration;
     if(!applySettings) { 
         completedCycles = 0;
          localStorage.setItem('timerSettings', JSON.stringify({ workDuration, breakDuration, completedCycles, currentTheme }));
     }
    startPauseBtn.textContent = '▶ 开始'; 
    updateDisplay();
    scheduleStatusUpdate(); // EVENT: Timer Reset
 };
 const skipTimer = () => {
     // pauseTimer() calls scheduleStatusUpdate, call it before changing state
     const wasRunning = isRunning;
     pauseTimer(); 
      if (currentMode === 'work') { currentMode = 'break'; timeLeft = breakDuration; } 
      else { currentMode = 'work'; timeLeft = workDuration; }
      startPauseBtn.textContent = '▶ 开始'; 
      updateDisplay();
      if (!wasRunning) scheduleStatusUpdate(); // EVENT: Mode skipped (if not running)
 }

// --- Settings & Theme Functions ---
 const applyTheme = (themeName) => {
     if (!themeName) themeName = 'default';
      document.body.setAttribute('data-theme', themeName);
      currentTheme = themeName;
       themeSelectors.forEach(span => {
          span.classList.remove('active');
          if(span.dataset.theme === themeName) span.classList.add('active');
       });
  }
 const openSettings = () => { pauseTimer(); workDurationInput.value = workDuration / 60; breakDurationInput.value = breakDuration / 60; settingsModal.classList.add('show'); }
 const closeSettings = () => settingsModal.classList.remove('show');
 const saveSettings = () => {
     const newWorkMin = parseInt(workDurationInput.value, 10);
     const newBreakMin = parseInt(breakDurationInput.value, 10);
     if (isNaN(newWorkMin) || isNaN(newBreakMin) || newWorkMin <=0 || newBreakMin <=0) {
          alert("请输入有效的正整数分钟数!"); return;
     }
     const durationChanged = (workDuration !== newWorkMin * 60) || (breakDuration !== newBreakMin * 60)
     workDuration = newWorkMin * 60; breakDuration = newBreakMin * 60;
     const activeTheme = document.querySelector('.theme-selector span.active');
     currentTheme = activeTheme ? activeTheme.dataset.theme : 'default';
     saveTimerSettings();
     if(durationChanged) resetTimer(true); // resetTimer calls scheduleStatusUpdate
     else updateDisplay(); // Just update info text and title, no state change event
     closeSettings();
  }
  const handleThemeChange = (e) => {
      if(e.target.dataset.theme){
          document.body.setAttribute('data-theme', e.target.dataset.theme);
           themeSelectors.forEach(span => {
              span.classList.remove('active');
               if(span.dataset.theme === e.target.dataset.theme) span.classList.add('active');
            });
      }
   }

// --- Room / WebSocket Functions ---
const renderRoomUsers = () => {
    userListEl.innerHTML = '';
    const users = Object.values(roomUsers);
    userCountEl.textContent = `(${users.length})`;
    if (users.length === 0) {
         userListEl.innerHTML = '<li>房间里只有你</li>';
         return;
    }
     // Add self first
     const selfLi = document.createElement('li');
     const selfTimerInfo = `${currentMode}: ${formatTime(timeLeft)} ${isRunning ? '⏳' : '⏸️'}`;
     selfLi.innerHTML = `
        <span class="user-name">${escapeHTML(myName)} (你)</span>
        <span class="user-tasks">[${taskStats}]</span>
        <span class="user-status">${selfTimerInfo}</span>
     `;
      userListEl.appendChild(selfLi);

    // Add others
    users.sort((a,b) => a.name.localeCompare(b.name)).forEach(user => {
       if(user.name === myName) return; // Skip self if also in the list from server (shouldn't happen often but safeguard)
       const li = document.createElement('li');
       const status = user.status || {};
       const mode = status.mode === 'work' ? '专注' : (status.mode === 'break' ? '休息' : '??');
       const timerInfo = `${mode}: ${formatTime(status.timeLeft || 0)} ${status.isRunning ? '⏳' : '⏸️'}`;
       const taskInfo = status.tasks || '?/?';
       li.innerHTML = `
          <span class="user-name">${escapeHTML(user.name)}</span>
          <span class="user-tasks">[${taskInfo}]</span>
          <span class="user-status">${timerInfo}</span>
       `;
       userListEl.appendChild(li);
    });
}

const addChatMessage = (name, message, isSystem = false) => {
     const msgDiv = document.createElement('div');
     msgDiv.className = 'chat-message';
     if(isSystem) {
          msgDiv.innerHTML = `<i>系统: ${escapeHTML(message)}</i>`;
     } else {
          msgDiv.innerHTML = `<strong>${escapeHTML(name)}:</strong> ${escapeHTML(message)}`;
     }
     chatBox.appendChild(msgDiv);
     chatBox.scrollTop = chatBox.scrollHeight; // Auto scroll
}

const sendWS = (type, payload = {}) => {
   if (ws && ws.readyState === WebSocket.OPEN) {
      try {
         ws.send(JSON.stringify({ type, payload }));
      } catch (e) {
         console.error("WS Send error:", e);
         handleWSClose();
      }
   }
}
// 节流发送状态更新 - 只在关键事件触发
const scheduleStatusUpdate = () => {
    if(!ws || ws.readyState !== WebSocket.OPEN) return;
     if(statusUpdateTimeoutId) clearTimeout(statusUpdateTimeoutId);
      // console.log("Scheduling status update...");
     statusUpdateTimeoutId = setTimeout(()=>{
         // console.log("Sending status update!");
         sendWS('STATUS_UPDATE', {
             mode: currentMode,
             timeLeft: timeLeft,
             isRunning: isRunning,
             tasks: taskStats
         });
         statusUpdateTimeoutId = null;
     }, 200); // wait 200ms to batch rapid events (e.g. pause then reset)
}

const handleMessage = (event) => {
     try {
        const data = JSON.parse(event.data);
       // console.log("Received:", data);
        switch (data.type) {
           case 'INIT': // 收到初始房间状态
               roomUsers = data.payload.users || {};
                delete roomUsers[data.payload.myId]; // Don't list self from server data
               chatBox.innerHTML = ''; // clear chat
               data.payload.chat.forEach(msg => addChatMessage(msg.name, msg.text));
               renderRoomUsers();
               addChatMessage('', `已加入房间 ${currentRoomPin}`, true);
               break;
            case 'USER_JOINED':
                 if (data.payload.name === myName) break; // ignore self
                 roomUsers[data.payload.id] = { name: data.payload.name, status: data.payload.status || {} };
                 renderRoomUsers();
                 addChatMessage('', `${data.payload.name} 加入了房间`, true);
                 break;
            case 'USER_LEFT':
                 const leftUserName = roomUsers[data.payload.id]?.name || 'Unknown';
                 delete roomUsers[data.payload.id];
                 renderRoomUsers();
                 if(leftUserName !== myName) // Don't show message if self left
                    addChatMessage('', `${leftUserName} 离开了房间`, true);
                 break;
             case 'STATUS_UPDATE':
                  // Only update others, not self
                 if(roomUsers[data.payload.id] && data.payload.name !== myName) {
                    roomUsers[data.payload.id].status = data.payload.status;
                    renderRoomUsers();
                 }
                 break;
              case 'CHAT':
                   addChatMessage(data.payload.name, data.payload.text);
                   break;
              case 'PONG': break;
              default: console.warn("Unknown message type:", data.type);
        }
     } catch(e) {
        console.error("Error parsing WS message", e, event.data);
     }
}

const handleWSClose = (event) => {
     console.log("WebSocket Closed", event?.code, event?.reason);
      if(ws) { // Only show error if not intentionally closed by leaveRoom
         addChatMessage('', `连接已断开 (Code: ${event?.code || 'Unknown'})`, true);
          roomStatusEl.textContent = '已断开';
      }
     ws = null;
     roomUsers = {};
     renderRoomUsers();
      if (pingIntervalId) clearInterval(pingIntervalId);
      pingIntervalId = null;
      joinBtn.style.display = 'inline-block';
      leaveBtn.style.display = 'none';
}


const connectToRoom = (name, pin) => {
    if(ws) ws.close();
    myName = name;
    currentRoomPin = pin;
    localStorage.setItem('userName', myName);
    localStorage.setItem('roomPin', currentRoomPin);
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsURL = `${wsProto}//${window.location.host}/api/room/${pin}?name=${encodeURIComponent(name)}`; 
    
    roomStatusEl.textContent = `连接中...`;
    roomPanel.style.display = 'block';
    userListEl.innerHTML = '<li>连接中...</li>';
     userCountEl.textContent = '';
    chatBox.innerHTML = '';

    ws = new WebSocket(wsURL);
    
    ws.onopen = () => {
        console.log("WebSocket Connected");
        roomStatusEl.textContent = '已连接';
        roomInfoEl.textContent = `房间: ${pin} (${name})`;
        joinBtn.style.display = 'none';
        leaveBtn.style.display = 'inline-block';
        scheduleStatusUpdate(); // EVENT: Send initial status on connect
        if (pingIntervalId) clearInterval(pingIntervalId);
        pingIntervalId = setInterval(() => sendWS('PING'), PING_INTERVAL);
    };
    ws.onmessage = handleMessage;
    ws.onclose = handleWSClose;
     ws.onerror = (error) => {
        console.error("WebSocket Error:", error);
        addChatMessage('', `连接错误!`, true);
        roomStatusEl.textContent = '连接错误';
        handleWSClose(); // Clean up like close
    };
}

const leaveRoom = () => {
    if (ws) {
       const tempWs = ws;
       ws = null; // Prevent onclose from showing error message
       tempWs.close(1000, "User left");
    }
    handleWSClose(); // clean up ping, buttons etc
    roomStatusEl.textContent = '未连接';
    roomInfoEl.textContent = '';
    roomPanel.style.display = 'none';
    currentRoomPin = '';
     localStorage.removeItem('roomPin'); // Remove auto-join on leave
}

const openJoinModal = () => {
    userNameInput.value = myName;
    roomPinInput.value = currentRoomPin;
    joinModal.classList.add('show');
}
const closeJoinModal = () => joinModal.classList.remove('show');
const submitJoinForm = (e) => {
    e.preventDefault();
     if (!joinForm.checkValidity()) {
       joinForm.reportValidity();
        return;
     }
    const name = userNameInput.value.trim();
    const pin = roomPinInput.value.trim();
     connectToRoom(name, pin);
     closeJoinModal();
}
 const submitChatForm = (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if(text && ws) {
          sendWS('CHAT', { text: text });
          chatInput.value = '';
      }
 }


 // --- Initialization ---
 const loadState = () => {
     const savedTasks = localStorage.getItem('tasks');
     tasks = savedTasks ? JSON.parse(savedTasks) : [];
     renderTasks();
     const savedSettings = localStorage.getItem('timerSettings');
      let loadedTheme = 'default';
     if(savedSettings) {
         try {
              const settings = JSON.parse(savedSettings);
              workDuration = parseInt(settings.workDuration, 10) || 25 * 60;
              breakDuration = parseInt(settings.breakDuration, 10) || 5 * 60;
              completedCycles = parseInt(settings.completedCycles, 10) || 0;
              loadedTheme = settings.currentTheme || 'default';
         } catch(e) { console.error("Error parsing settings", e); workDuration = 25 * 60; breakDuration = 5 * 60; completedCycles = 0;}
     }
      timeLeft = workDuration;
      applyTheme(loadedTheme); updateDisplay();
      addTaskBtn.disabled = taskInput.value.trim() === '';
      // Load saved name/pin for modal, but do NOT auto-connect
       myName = localStorage.getItem('userName') || '';
       currentRoomPin = localStorage.getItem('roomPin') || '';
      // if(myName && currentRoomPin) {
         // connectToRoom(myName, currentRoomPin); // Auto-join is disabled, user must click button
      // }
 };

// --- Event Listeners ---
 document.addEventListener('DOMContentLoaded', loadState);
 taskForm.addEventListener('submit', addTask);
  taskInput.addEventListener('input', (e) => { addTaskBtn.disabled = e.target.value.trim() === ''; });
 taskList.addEventListener('click', handleTaskAction);
 priorityBtns.forEach(btn => btn.addEventListener('click', setPriority));
 startPauseBtn.addEventListener('click', toggleTimer);
 resetBtn.addEventListener('click', () => resetTimer(false));
 skipBtn.addEventListener('click', skipTimer);
 settingsOpenBtn.addEventListener('click', openSettings);
 settingsCancelBtn.addEventListener('click', () => { applyTheme(currentTheme); closeSettings(); });
 settingsSaveBtn.addEventListener('click', saveSettings);
 settingsModal.addEventListener('click', (e) => { if(e.target === settingsModal) { applyTheme(currentTheme); closeSettings();} });
 themeSelectors.forEach(span => span.addEventListener('click', handleThemeChange));
 document.querySelector('.priority-options').addEventListener('click', (e) => { if (e.target.classList.contains('priority-btn')) { e.preventDefault(); } });
// Room Events
 joinBtn.addEventListener('click', openJoinModal);
 leaveBtn.addEventListener('click', leaveRoom);
 joinForm.addEventListener('submit', submitJoinForm);
 joinCancelBtn.addEventListener('click', closeJoinModal);
 joinModal.addEventListener('click', (e) => { if(e.target === joinModal) closeJoinModal(); });
 chatForm.addEventListener('submit', submitChatForm);
 // Ensure UI is consistent on manual close
 window.addEventListener('beforeunload', () => {
    if(ws) ws.close(1000, "Browser closed");
 });