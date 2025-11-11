// --- State (单机版) ---
let tasks = [];
let currentPriority = 'medium';
let timerInterval = null;
let timeLeft = 25 * 60;
let isRunning = false;
let currentMode = 'work';
let workDuration = 25 * 60;
let breakDuration = 5 * 60;
let completedCycles = 0;
// 新增：基于时间戳的计时
let timerStartTime = null; // 计时器开始的时间戳
let timerEndTime = null; // 计时器应该结束的时间戳
// 新增: 专注时间统计
let dailyFocusTime = 0; // 今日总专注时间（秒）
let currentSessionStartTime = null; // 当前专注会话开始时间
let focusHistory = []; // 专注历史记录
// 新增: UI状态, 并更新默认主题
let currentTheme = 'blue-grey';
let currentUiMode = 'light'; // 'light' or 'dark'
let currentLang = 'zh'; // 'zh' or 'en'
let calendar = null; // 日历实例
// 新增: 正计时
let stopwatchTime = 0; // 秒
let stopwatchInterval = null;
let stopwatchRunning = false;

// --- DOM Elements ---
const taskForm = document.getElementById('add-task-form');
const taskInput = document.getElementById('task-input');
const taskList = document.getElementById('task-list');
const priorityBtns = document.querySelectorAll('.priority-btn');
const emptyStateEl = document.getElementById('empty-state');
const timerDisplay = document.getElementById('timer-display');
const startPauseBtn = document.getElementById('start-pause-btn');
const resetBtn = document.getElementById('reset-btn');
const skipBtn = document.getElementById('skip-btn');
const cycleCountEl = document.getElementById('cycle-count');
const timerModeTitleEl = document.getElementById('timer-mode-title');
const dailyFocusTimeEl = document.getElementById('daily-focus-time');
const resetFocusTimeBtn = document.getElementById('reset-focus-time-btn');
const workEndSound = document.getElementById('work-end-sound');
const breakEndSound = document.getElementById('break-end-sound');
const settingsModal = document.getElementById('settings-modal');
const settingsOpenBtn = document.getElementById('settings-open-btn');
const settingsSaveBtn = document.getElementById('settings-save-btn');
const settingsCancelBtn = document.getElementById('settings-cancel-btn');
const infoWorkEl = document.getElementById('info-work');
const infoBreakEl = document.getElementById('info-break');
const addTaskBtn = document.getElementById('add-task-btn');
const completionCircle = document.getElementById('completion-circle');
const completionPercentageEl = document.getElementById('completion-percentage');
const CIRCLE_RADIUS = 54;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;
const themeFabBtn = document.getElementById('theme-fab-btn');
const themePanel = document.getElementById('theme-panel');
const themeSelectorPanel = document.getElementById('theme-selector-panel');
const darkModeCheckbox = document.getElementById('dark-mode-checkbox');
const workDurationSlider = document.getElementById('work-duration-slider');
const workDurationValue = document.getElementById('work-duration-value');
const breakDurationSlider = document.getElementById('break-duration-slider');
const breakDurationValue = document.getElementById('break-duration-value');
const calendarTitle = document.getElementById('calendar-title');
const calendarNav = document.querySelector('.calendar-nav');
const calendarViewMode = document.querySelector('.calendar-view-mode');
const targetDateInput = document.getElementById('target-date');
const countdownDisplay = document.getElementById('countdown-display');
const targetTitleInput = document.getElementById('target-title');
const stopwatchDisplay = document.getElementById('stopwatch-display');
const stopwatchStartBtn = document.getElementById('stopwatch-start-btn');
const stopwatchResetBtn = document.getElementById('stopwatch-reset-btn');
const shareBtn = document.getElementById('share-btn');
const langCheckbox = document.getElementById('lang-checkbox');


// --- Helper Functions ---
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

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
   audioEl.play().catch(() => {});
};

// 专注时间相关辅助函数
const formatFocusTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (currentLang === 'zh') {
        if (hours > 0) {
            return `${hours}小时${minutes}分钟`;
        }
        return `${minutes}分钟`;
    } else {
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }
};

const getTodayDateString = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const updateDailyFocusDisplay = () => {
    if (dailyFocusTimeEl) {
        let totalFocusTime = dailyFocusTime;

        // 如果当前正在专注，加上当前会话的时间
        if (currentMode === 'work' && currentSessionStartTime && isRunning) {
            const currentSessionTime = Math.floor((new Date() - currentSessionStartTime) / 1000);
            totalFocusTime += currentSessionTime;
        }

        dailyFocusTimeEl.innerHTML = formatFocusTime(totalFocusTime);
    }
};

const resetDailyFocusTime = () => {
    const msg = currentLang === 'zh' ? '确定要重置今日专注时间吗？这将清除今天的所有专注记录。' : 'Reset today\'s focus time? This will clear all focus records for today.';
    if (confirm(msg)) {
        dailyFocusTime = 0;
        focusHistory = focusHistory.filter(session => session.date !== getTodayDateString());
        saveFocusHistory();
        updateDailyFocusDisplay();
    }
};

// --- Stopwatch Functions ---
const formatStopwatchTime = (seconds) => {
    const hours = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}:${secs}`;
};

const updateStopwatchDisplay = () => {
    stopwatchDisplay.textContent = formatStopwatchTime(stopwatchTime);
};

const toggleStopwatch = () => {
    if (stopwatchRunning) {
        clearInterval(stopwatchInterval);
        stopwatchStartBtn.textContent = currentLang === 'zh' ? '▶ 继续' : '▶ Resume';
        stopwatchRunning = false;
    } else {
        stopwatchInterval = setInterval(() => {
            stopwatchTime++;
            updateStopwatchDisplay();
        }, 1000);
        stopwatchStartBtn.textContent = currentLang === 'zh' ? '⏸ 暂停' : '⏸ Pause';
        stopwatchRunning = true;
    }
};

const resetStopwatch = () => {
    clearInterval(stopwatchInterval);
    stopwatchTime = 0;
    stopwatchRunning = false;
    stopwatchStartBtn.textContent = currentLang === 'zh' ? '▶ 开始' : '▶ Start';
    updateStopwatchDisplay();
};

// --- Share Functions ---
const shareProgress = () => {
    const completedTasks = tasks.filter(t => t.completed).length;
    const totalTasks = tasks.length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const shareText = currentLang === 'zh'
        ? `🍅 To-mato 今日成果

⏱️ 专注时长: ${formatFocusTime(dailyFocusTime)}
🔄 完成循环: ${completedCycles} 个
✅ 完成任务: ${completedTasks}/${totalTasks} (${completionRate}%)

继续加油！💪
https://sdxdlgz.github.io/To-mato/`
        : `🍅 To-mato Daily Progress

⏱️ Focus Time: ${formatFocusTime(dailyFocusTime)}
🔄 Cycles: ${completedCycles}
✅ Tasks: ${completedTasks}/${totalTasks} (${completionRate}%)

Keep going! 💪
https://sdxdlgz.github.io/To-mato/`;

    if (navigator.share) {
        navigator.share({
            title: currentLang === 'zh' ? 'To-mato 今日成果' : 'To-mato Daily Progress',
            text: shareText
        }).catch(() => {});
    } else {
        navigator.clipboard.writeText(shareText).then(() => {
            alert(currentLang === 'zh' ? '成果已复制到剪贴板！' : 'Copied to clipboard!');
        }).catch(() => {
            alert(shareText);
        });
    }
};

// --- Countdown Functions ---
const saveCountdownData = () => {
    const countdownData = {
        title: targetTitleInput.value,
        date: targetDateInput.value
    };
    localStorage.setItem('countdownData', JSON.stringify(countdownData));
};

const updateCountdown = () => {
    const targetTitle = targetTitleInput.value.trim();
    const targetDateValue = targetDateInput.value;

    saveCountdownData();

    if (!targetDateValue) {
        countdownDisplay.innerHTML = currentLang === 'zh' ? '请选择一个日期' : 'Please select a date';
        return;
    }

    const targetDate = new Date(targetDateValue);
    const today = new Date();

    targetDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const diffTime = targetDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const titleText = targetTitle ? escapeHTML(targetTitle) : (currentLang === 'zh' ? '目标日' : 'Target Day');

    if (diffDays < 0) {
        countdownDisplay.innerHTML = currentLang === 'zh' ? `"${titleText}"已经过去了!` : `"${titleText}" has passed!`;
    } else if (diffDays === 0) {
        countdownDisplay.innerHTML = currentLang === 'zh' ? `"${titleText}"就是今天！🎉` : `"${titleText}" is today! 🎉`;
    } else {
        countdownDisplay.innerHTML = currentLang === 'zh'
            ? `距离"${titleText}"还有 <span class="countdown-days">${diffDays}</span> 天`
            : `<span class="countdown-days">${diffDays}</span> days until "${titleText}"`;
    }
};

// --- TODO Functions (大改, 支持编辑) ---
const saveTasks = debounce(() => localStorage.setItem('tasks', JSON.stringify(tasks)), 300);
const animatePercentage = (targetPercentage) => {
   let current = parseInt(completionPercentageEl.textContent) || 0;
   const step = (targetPercentage > current) ? 1 : -1;
   if (current === targetPercentage) return;
   const interval = setInterval(() => {
       if (current !== targetPercentage) {
           current += step;
           completionPercentageEl.textContent = `${current}%`;
       } else {
           clearInterval(interval);
       }
   }, 15);
};
let cachedPrimaryColor = null;
const updatePrimaryColor = () => {
    cachedPrimaryColor = getComputedStyle(document.body).getPropertyValue('--primary-color').trim();
};

const renderTasks = () => {
    taskList.innerHTML = '';
    const completedCount = tasks.filter(task => task.completed).length;
    const totalTasks = tasks.length;
    const percentage = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;
    const offset = CIRCLE_CIRCUMFERENCE * (1 - percentage / 100);

    completionCircle.style.strokeDasharray = CIRCLE_CIRCUMFERENCE;
    completionCircle.style.strokeDashoffset = offset;
    if (!cachedPrimaryColor) updatePrimaryColor();
    if (cachedPrimaryColor) {
        completionCircle.style.stroke = cachedPrimaryColor;
    }

    animatePercentage(percentage);
    emptyStateEl.style.display = totalTasks === 0 ? 'block' : 'none';
    tasks.forEach(task => {
        const li = document.createElement('li');
        li.dataset.id = task.id;
        li.innerHTML = `
            <span class="draggable-handle">⠿</span>
            <input type="checkbox" ${task.completed ? 'checked' : ''}>
            <span class="priority-dot ${task.priority}" title="点击更改优先级"></span>
            <span class="task-text">${escapeHTML(task.text)}</span>
            <button class="delete-btn" title="删除任务">&times;</button>
        `;
        taskList.appendChild(li);
    });
};
const addTask = (e) => {
   e.preventDefault();
   const text = taskInput.value.trim();
   if (!text) return;
   tasks.push({ id: Date.now(), text: text, priority: currentPriority, completed: false, createdAt: new Date().toISOString() });
   taskInput.value = '';
   addTaskBtn.disabled = true;
   saveTasks();
   renderTasks();
};
const handleTaskAction = (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    const id = parseInt(li.dataset.id);
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    if (e.target.type === 'checkbox') {
        task.completed = e.target.checked;
        if (task.completed) {
            task.completedAt = new Date().toISOString();
            addEventToCalendar(task);
        } else {
            delete task.completedAt;
            removeEventFromCalendar(task.id);
        }
        saveTasks();
        renderTasks();
        refreshCalendarEvents();
    } else if (e.target.classList.contains('delete-btn')) {
        tasks = tasks.filter(t => t.id !== id);
        removeEventFromCalendar(id);
        saveTasks();
        renderTasks();
    } else if (e.target.classList.contains('task-text')) {
        e.preventDefault();
        e.stopPropagation();
        enterEditMode(e.target, id);
        return; // 不要在编辑模式下重新渲染
    } else if (e.target.classList.contains('priority-dot')) {
        const priorities = ['low', 'medium', 'high'];
        const currentIndex = priorities.indexOf(task.priority);
        task.priority = priorities[(currentIndex + 1) % priorities.length];
        updateEventInCalendar(task);
        saveTasks();
        renderTasks();
    }
};
const enterEditMode = (textElement, taskId) => {
    const currentText = textElement.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentText;
    input.className = 'edit-task-input';
    textElement.replaceWith(input);
    input.focus();
    input.select();

    const saveChanges = () => {
        const newText = input.value.trim();
        const task = tasks.find(t => t.id === taskId);
        if (task && newText && newText !== task.text) {
            task.text = newText;
            updateEventInCalendar(task);
        }
        saveTasks();
        renderTasks(); // 重新渲染整个列表
    };

    input.addEventListener('blur', saveChanges);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            input.blur();
        } else if (e.key === 'Escape') {
            input.value = currentText; // 恢复原始文本
            input.blur();
        }
    });
};
const setPriority = (e) => {
   if(!e.target.classList.contains('priority-btn')) return;
   priorityBtns.forEach(btn => btn.classList.remove('active'));
   e.target.classList.add('active');
   currentPriority = e.target.dataset.priority;
};

// --- Pomodoro Functions ---
const saveTimerState = debounce(() => {
   const timerState = {
       workDuration,
       breakDuration,
       completedCycles,
       timeLeft,
       currentMode,
       isRunning: isRunning,
       currentSessionStartTime: currentSessionStartTime ? currentSessionStartTime.toISOString() : null,
       timerStartTime: timerStartTime ? timerStartTime.toISOString() : null,
       timerEndTime: timerEndTime ? timerEndTime.toISOString() : null,
       lastSaveTime: new Date().toISOString()
   };
   localStorage.setItem('timerSettings', JSON.stringify(timerState));
}, 500);

const saveFocusHistory = debounce(() => {
   const today = getTodayDateString();
   const focusData = {
       date: today,
       totalTime: dailyFocusTime,
       history: focusHistory.filter(session => session.date === today)
   };
   localStorage.setItem('focusHistory', JSON.stringify(focusData));
}, 500);

const saveTimerSettingsOnly = () => {
   saveTimerState();
   saveFocusHistory();
};
const updateDisplay = () => {
    const t = translations[currentLang];
    timerDisplay.textContent = formatTime(timeLeft);
    cycleCountEl.textContent = completedCycles;
    timerModeTitleEl.textContent = currentMode === 'work' ? t.focusTime : t.breakTime;
    skipBtn.textContent = currentMode === 'work' ? t.skip : t.work;
    const workMin = workDuration / 60;
    const breakMin = breakDuration / 60;
    document.querySelector('.timer-info').innerHTML = currentLang === 'zh'
        ? `专注: <span id="info-work">${workMin}</span>分 | 休息: <span id="info-break">${breakMin}</span>分`
        : `Focus: <span id="info-work">${workMin}</span>m | Break: <span id="info-break">${breakMin}</span>m`;
    updateDailyFocusDisplay();

    // 更新按钮状态
    if (isRunning) {
        startPauseBtn.textContent = t.pause;
        resetBtn.disabled = true;
        skipBtn.disabled = true;
        settingsOpenBtn.disabled = true;
    } else {
        startPauseBtn.textContent = timeLeft === (currentMode === 'work' ? workDuration : breakDuration) ? t.start : t.resume;
        resetBtn.disabled = false;
        skipBtn.disabled = false;
        settingsOpenBtn.disabled = false;
    }

    let title = 'To-mato';
     if (isRunning) title = `${formatTime(timeLeft)} - ${currentMode === 'work' ? (currentLang === 'zh' ? '专注中' : 'Focusing') : (currentLang === 'zh' ? '休息中' : 'Breaking')} | ${title}`;
     else if (startPauseBtn.textContent.includes('继续') || startPauseBtn.textContent.includes('Resume')) title = `${currentLang === 'zh' ? '已暂停' : 'Paused'} | ${title}`;
     document.title = title;
};
const switchMode = () => {
   clearInterval(timerInterval);
   isRunning = false;

   // 如果是工作模式结束，记录专注时间
   if (currentMode === 'work' && currentSessionStartTime) {
       const sessionDuration = Math.floor((new Date() - currentSessionStartTime) / 1000);
       if (sessionDuration > 0) {
           dailyFocusTime += sessionDuration;
           focusHistory.push({
               date: getTodayDateString(),
               startTime: currentSessionStartTime.toISOString(),
               endTime: new Date().toISOString(),
               duration: sessionDuration
           });
           saveFocusHistory();
       }
       currentSessionStartTime = null;
   }


   if (currentMode === 'work') {
       currentMode = 'break'; timeLeft = breakDuration; playSound(workEndSound);
   } else {
       // 休息结束，完成一个完整循环
       completedCycles++;
       currentMode = 'work'; timeLeft = workDuration; playSound(breakEndSound);
   }
   
   // 修复：重置时间戳，为下一次计时做准备
   timerStartTime = null;
   timerEndTime = null;

   saveTimerSettingsOnly();
   startTimer(); // 自动开始下一个计时器
};
// 基于时间戳的计时更新函数
const updateTimerFromTimestamp = () => {
    if (!isRunning || !timerEndTime) return;

    const now = new Date();
    const remainingMs = timerEndTime.getTime() - now.getTime();

    if (remainingMs <= 0) {
        // 时间到了，切换模式
        timeLeft = 0;
        switchMode();
    } else {
        // 更新剩余时间
        timeLeft = Math.ceil(remainingMs / 1000);
        updateDisplay();
    }
};

const tick = () => {
    updateTimerFromTimestamp();
    // 每10秒保存一次状态，避免频繁写入
    if (timeLeft % 10 === 0) {
        saveTimerState();
    }
};
const startTimer = () => {
   if(isRunning) return;
    if (timeLeft <= 0) { timeLeft = (currentMode === 'work') ? workDuration : breakDuration; updateDisplay();
       if (timeLeft <=0) return;
    }
   isRunning = true;

   // 如果 timerEndTime 不存在, 说明是全新的计时, 需要设置它.
   // 如果存在, 说明是“恢复”, 我们要沿用旧的结束时间.
   if (!timerEndTime) {
       timerStartTime = new Date();
       timerEndTime = new Date(timerStartTime.getTime() + timeLeft * 1000);
   }

   // 如果是工作模式且没有会话开始时间，记录开始时间
   if (currentMode === 'work' && !currentSessionStartTime) {
       currentSessionStartTime = new Date();
   }


   if(timerInterval) clearInterval(timerInterval);
   timerInterval = setInterval(tick, 1000);
   saveTimerState(); // 保存状态
   updateDisplay();
};
const pauseTimer = () => {
   if(!isRunning) return;

   // 基于时间戳更新当前剩余时间
   updateTimerFromTimestamp(); // This correctly updates timeLeft based on timerEndTime

   // 如果是工作模式且有开始时间，记录这段专注时间
   if (currentMode === 'work' && currentSessionStartTime) {
       const sessionDuration = Math.floor((new Date() - currentSessionStartTime) / 1000);
       if (sessionDuration > 0) {
           dailyFocusTime += sessionDuration;
           focusHistory.push({
               date: getTodayDateString(),
               startTime: currentSessionStartTime.toISOString(),
               endTime: new Date().toISOString(),
               duration: sessionDuration
           });
           saveFocusHistory();
       }
       // 暂停时，清除会话开始时间。恢复时会重新设置。
       currentSessionStartTime = null;
   }

    clearInterval(timerInterval);
    timerInterval = null;
    isRunning = false;
    // DO NOT nullify timerEndTime. This preserves the target end time.
    // timerStartTime can be left as is, or nullified. Nullifying is cleaner.
    timerStartTime = null;


    saveTimerState(); // 保存状态
     updateDisplay();
};
const toggleTimer = () => {
    workEndSound.load(); breakEndSound.load();
    if (isRunning) pauseTimer(); else startTimer();
};
// 重置计时器和循环数（不影响今日专注时间）
const resetTimer = (applySettings = false) => {
   pauseTimer();
   currentMode = 'work';
   timeLeft = workDuration;
   currentSessionStartTime = null; // 重置会话开始时间
   timerStartTime = null;
   timerEndTime = null;
    if(!applySettings) {
        completedCycles = 0;
        saveTimerSettingsOnly();
    }
   startPauseBtn.textContent = translations[currentLang].start;
   saveTimerState(); // 保存状态
   updateDisplay();
};
const skipTimer = () => {
    pauseTimer();
     if (currentMode === 'work') {
         currentMode = 'break';
         timeLeft = breakDuration;
         currentSessionStartTime = null; // 跳过工作时清除会话
     } else {
         currentMode = 'work';
         timeLeft = workDuration;
     }
     timerStartTime = null;
     timerEndTime = null;

     saveTimerState(); // 保存状态
     updateDisplay();
}

// --- Language Functions ---
const translations = {
    zh: {
        title: 'To-mato',
        subtitle: '管理你的任务，用番茄钟提高效率，记录你的每一天',
        focusTime: '专注时间',
        breakTime: '休息一下',
        completedCycles: '已完成',
        cycles: '个循环',
        todayFocus: '今日已专注',
        start: '▶ 开始',
        pause: '⏸ 暂停',
        resume: '▶ 继续',
        reset: '🔄 重置',
        skip: '☕ 休息',
        work: '👩‍💻 工作',
        addTask: '添加新任务',
        taskPlaceholder: '输入新任务...',
        priority: '优先级:',
        low: '低',
        medium: '中',
        high: '高',
        addTaskBtn: '＋ 添加任务',
        noTasks: '还没有任务，添加一个开始吧!',
        completed: '已完成',
        countdown: '目标日倒计时',
        targetName: '目标名称:',
        targetPlaceholder: '例如: 高考',
        selectDate: '选择一个未来的日期:',
        stopwatch: '正计时',
        todayCompleted: '今日已办',
        settings: '番茄钟设置',
        focusDuration: '专注时长 (分钟):',
        breakDuration: '休息时长 (分钟):',
        cancel: '取消',
        save: '保存',
        themeColor: '主题颜色:',
        darkMode: '暗黑模式',
        language: '语言 / Language'
    },
    en: {
        title: 'To-mato',
        subtitle: 'Manage tasks, boost productivity with Pomodoro, track your days',
        focusTime: 'Focus Time',
        breakTime: 'Break Time',
        completedCycles: 'Completed',
        cycles: 'cycles',
        todayFocus: 'Today\'s Focus',
        start: '▶ Start',
        pause: '⏸ Pause',
        resume: '▶ Resume',
        reset: '🔄 Reset',
        skip: '☕ Break',
        work: '👩‍💻 Work',
        addTask: 'Add New Task',
        taskPlaceholder: 'Enter new task...',
        priority: 'Priority:',
        low: 'Low',
        medium: 'Med',
        high: 'High',
        addTaskBtn: '＋ Add Task',
        noTasks: 'No tasks yet, add one to start!',
        completed: 'Completed',
        countdown: 'Countdown Timer',
        targetName: 'Target Name:',
        targetPlaceholder: 'e.g., Exam',
        selectDate: 'Select a future date:',
        stopwatch: 'Stopwatch',
        todayCompleted: 'Today\'s Done',
        settings: 'Timer Settings',
        focusDuration: 'Focus Duration (min):',
        breakDuration: 'Break Duration (min):',
        cancel: 'Cancel',
        save: 'Save',
        themeColor: 'Theme Color:',
        darkMode: 'Dark Mode',
        language: '语言 / Language'
    }
};

const applyLanguage = (lang) => {
    currentLang = lang;
    const t = translations[lang];

    document.querySelector('header h1').textContent = t.title;
    document.querySelector('header p').textContent = t.subtitle;
    document.getElementById('timer-mode-title').textContent = currentMode === 'work' ? t.focusTime : t.breakTime;
    document.querySelector('.timer-status').innerHTML = `${t.completedCycles} <span id="cycle-count">${completedCycles}</span> ${t.cycles}`;
    document.querySelector('.focus-time-status').childNodes[0].textContent = `${t.todayFocus} `;
    document.getElementById('task-input').placeholder = t.taskPlaceholder;
    document.querySelector('.priority-options').childNodes[0].textContent = t.priority + ' ';
    document.querySelectorAll('.priority-btn')[0].textContent = t.low;
    document.querySelectorAll('.priority-btn')[1].textContent = t.medium;
    document.querySelectorAll('.priority-btn')[2].textContent = t.high;
    document.getElementById('add-task-btn').textContent = t.addTaskBtn;
    document.querySelector('.empty-state').innerHTML = `<div>📋</div>${t.noTasks}`;
    document.querySelector('.completion-label').textContent = t.completed;
    document.querySelectorAll('.card h3')[1].innerHTML = `<span class="icon">➕</span> ${t.addTask}`;
    document.querySelector('.countdown-section h3').innerHTML = `<span class="icon">🎯</span> ${t.countdown}`;
    document.querySelector('.stopwatch-section h3').innerHTML = `<span class="icon">⏱️</span> ${t.stopwatch}`;
    document.querySelector('.calendar-view-mode .view-label').textContent = t.todayCompleted;
    document.querySelector('#settings-modal h3').innerHTML = `<span class="icon">⚙️</span> ${t.settings}`;
    document.querySelector('label[for="work-duration-slider"]').textContent = t.focusDuration;
    document.querySelector('label[for="break-duration-slider"]').textContent = t.breakDuration;
    document.getElementById('settings-cancel-btn').textContent = t.cancel;
    document.getElementById('settings-save-btn').textContent = t.save;
    document.querySelector('#theme-panel > label:first-child').textContent = t.themeColor;
    document.querySelector('.dark-mode-toggle span').textContent = t.darkMode;
    document.querySelector('label[for="target-title"]').textContent = t.targetName;
    document.querySelector('label[for="target-date"]').textContent = t.selectDate;
    document.getElementById('target-title').placeholder = t.targetPlaceholder;
    document.getElementById('share-btn').textContent = currentLang === 'zh' ? '📤 分享成果' : '📤 Share';

    skipBtn.textContent = currentMode === 'work' ? t.skip : t.work;
    resetBtn.textContent = t.reset;
    setCalendarTitle();
    updateDisplay();

    if (stopwatchRunning) {
        stopwatchStartBtn.textContent = t.pause;
    } else {
        stopwatchStartBtn.textContent = stopwatchTime === 0 ? t.start : t.resume;
    }

    stopwatchResetBtn.textContent = t.reset;

    langCheckbox.checked = lang === 'en';
    updateCountdown();
};

// --- UI / Theme / Settings Functions ---
const saveUiSettings = () => {
   localStorage.setItem('uiSettings', JSON.stringify({ theme: currentTheme, mode: currentUiMode, lang: currentLang }));
}
const applyTheme = (themeName) => {
   document.body.dataset.theme = themeName;
   currentTheme = themeName;
   themeSelectorPanel.querySelectorAll('span').forEach(span => {
       span.classList.remove('active');
       if(span.dataset.theme === themeName) span.classList.add('active');
   });

   requestAnimationFrame(() => {
       updatePrimaryColor();
       if (cachedPrimaryColor && completionCircle) {
           completionCircle.style.stroke = cachedPrimaryColor;
       }
       if (calendar) {
           refreshCalendarEvents();
       }
   });
}
const applyMode = (modeName) => {
   document.body.dataset.mode = modeName;
   currentUiMode = modeName;
   darkModeCheckbox.checked = modeName === 'dark';
   if(calendar) refreshCalendarEvents();
}
const handleThemeChange = (e) => {
   const theme = e.target.dataset.theme;
   if(theme){
       applyTheme(theme);
       saveUiSettings();
   }
}
const openTimerSettings = () => {
   pauseTimer();
   workDurationSlider.value = workDuration / 60;
   workDurationValue.textContent = workDuration / 60;
   breakDurationSlider.value = breakDuration / 60;
   breakDurationValue.textContent = breakDuration / 60;
   settingsModal.classList.add('show');
}
const closeTimerSettings = () => settingsModal.classList.remove('show');
const saveTimerSettingsAction = () => {
    const newWorkMin = parseInt(workDurationSlider.value, 10);
    const newBreakMin = parseInt(breakDurationSlider.value, 10);
    const durationChanged = (workDuration !== newWorkMin * 60) || (breakDuration !== newBreakMin * 60)
    workDuration = newWorkMin * 60;
    breakDuration = newBreakMin * 60;
    saveTimerSettingsOnly();
    if(durationChanged) resetTimer(true);
    else updateDisplay();
    closeTimerSettings();
}

// --- Calendar Functions (深度优化) ---
const getPriorityColor = (priority) => {
    return getComputedStyle(document.body).getPropertyValue(`--${priority}-p`).trim() || '#555';
};
const initCalendar = () => {
    calendar = new tui.Calendar('#calendar', {
        defaultView: 'day',
        taskView: false,
        scheduleView: ['allday', 'time'],
        useCreationPopup: false,
        useDetailPopup: false, // 禁用默认弹窗，使用自定义
        week: {
            showTimezoneCollapseButton: true,
            timezonesCollapsed: false,
            hourStart: 0,
            hourEnd: 24
        },
        calendars: [
            { id: '1', name: 'Tasks', color: '#ffffff', bgColor: '#00a9ff', dragBgColor: '#00a9ff', borderColor: '#00a9ff' }
        ],
        template: {
            time: (schedule) => {
                // 日视图只显示标题，不显示圆点
                const taskId = schedule.raw?.taskId || schedule.id;
                return `<span data-task-id="${taskId}" title="${schedule.title}">${schedule.title}</span>`;
            },
            popupDetailDate: (_, start) => {
                const startDate = new Date(start);
                return `${startDate.getFullYear()}.${String(startDate.getMonth() + 1).padStart(2, '0')}.${String(startDate.getDate()).padStart(2, '0')}`;
            },
            popupDetailTitle: (schedule) => schedule.title,
            popupEdit: () => '✏️ 编辑',
            popupDelete: () => '🗑️ 删除'
        }
    });

    updateCalendarView(calendar.getViewName());

    // 延迟加载事件，确保日历完全初始化
    setTimeout(() => {
        tasks.filter(t => t.completed).forEach(addEventToCalendar);
        initScrollbarBehavior();
    }, 100);

    // 点击日期跳转到日视图
    calendar.on('clickDayname', (event) => {
        if (calendar.getViewName() === 'month' || calendar.getViewName() === 'week') {
            calendar.changeView('day', true);
            calendar.setDate(new Date(event.date));
            updateCalendarView('day');
            refreshCalendarEvents();
        }
    });

    // 点击月视图日期数字跳转到日视图
    calendar.on('clickMore', (event) => {
        const clickDate = new Date(event.date);
        const dayTasks = tasks.filter(task => {
            if (!task.completed || !task.completedAt) return false;
            const taskDate = new Date(task.completedAt);
            return taskDate.toDateString() === clickDate.toDateString();
        });

        if (dayTasks.length > 0) {
            showDayTasksPopup(dayTasks, event.event, clickDate);
        }
    });

    // 点击事件显示自定义弹窗
    calendar.on('clickSchedule', (event) => {
        const schedule = event.schedule;
        const taskId = parseInt(schedule.raw?.taskId || schedule.id);
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            showTaskDetailPopup(task, event.event);
        }
    });

    // 添加DOM事件监听来处理任务圆点点击
    setTimeout(() => {
        const calendarEl = document.getElementById('calendar');
        if (calendarEl) {
            calendarEl.addEventListener('click', (e) => {
                // 处理任务圆点点击

                // 检查是否点击了任务相关元素
                const timeSchedule = e.target.closest('.tui-full-calendar-time-schedule');

                if (timeSchedule) {
                    // 在时间事件容器中查找taskId
                    const taskElement = timeSchedule.querySelector('[data-task-id]');
                    if (taskElement) {
                        const taskId = parseInt(taskElement.dataset.taskId);
                        if (taskId) {
                            e.preventDefault();
                            e.stopPropagation();

                            const task = tasks.find(t => t.id === taskId);
                            if (task) {
                                showTaskDetailPopup(task, e);
                                return;
                            }
                        }
                    }
                }


            });
        }
    }, 100);
};
const updateCalendarView = (view) => {
    document.querySelectorAll('.calendar-view-mode button').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`view-${view}`);
    if (activeBtn) activeBtn.classList.add('active');
    setCalendarTitle();
};
const setCalendarTitle = () => {
    if (!calendar) return;
    const date = calendar.getDate();
    const title = currentLang === 'zh'
        ? `${date.getFullYear()}年 ${date.getMonth() + 1}月 ${date.getDate()}日`
        : `${date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
    calendarTitle.textContent = title;
};
const addEventToCalendar = (task) => {
    if (!calendar) return;

    // 为任务创建一个具体的完成时间（如果没有的话，使用创建时间）
    const completedTime = task.completedAt || task.createdAt || new Date().toISOString();
    const completedDate = new Date(completedTime);

    // 基础事件配置
    const baseSchedule = {
        calendarId: '1',
        title: `✅ ${task.text}`,
        bgColor: getPriorityColor(task.priority),
        borderColor: getPriorityColor(task.priority),
        raw: { taskId: task.id, taskText: task.text, priority: task.priority }
    };

    try {
        // 日视图显示具体时间
        const endTime = new Date(completedDate.getTime() + 30 * 60000);
        calendar.createSchedules([{
            ...baseSchedule,
            id: String(task.id),
            isAllDay: false,
            category: 'time',
            start: completedDate,
            end: endTime
        }]);
    } catch (error) {
        console.error('Error creating calendar event:', error);
    }
};
const removeEventFromCalendar = (taskId) => { if (!calendar) return; try { calendar.deleteSchedule(String(taskId), '1'); } catch(e) {} };
const updateEventInCalendar = (task) => {
    if (!calendar || !task.completed) return;
    try {
        calendar.updateSchedule(String(task.id), '1', {
            title: `✅ ${task.text}`,
            bgColor: getPriorityColor(task.priority),
            borderColor: getPriorityColor(task.priority),
        });
    } catch(e) {}
};
const refreshCalendarEvents = debounce(() => {
    if (!calendar) return;
    calendar.clear();
    setTimeout(() => {
        tasks.filter(t => t.completed).forEach(addEventToCalendar);
    }, 50);
}, 100);

// 初始化滚动条行为（保持简单）
const initScrollbarBehavior = () => {
    // 不做任何特殊处理，让CSS样式自然生效
};



// 显示任务详情弹窗
const showTaskDetailPopup = (task, event) => {
    // 移除已存在的弹窗
    const existingPopup = document.querySelector('.custom-task-popup');
    if (existingPopup) {
        existingPopup.remove();
    }

    const popup = document.createElement('div');
    popup.className = 'custom-task-popup';
    popup.innerHTML = `
        <div class="popup-content">
            <div class="popup-header">
                <span class="priority-dot ${task.priority}"></span>
                <input type="text" class="popup-title-input" value="${escapeHTML(task.text)}" />
            </div>
            <div class="popup-date">
                ${task.completedAt ? new Date(task.completedAt).toLocaleString('zh-CN') : '未知时间'}
            </div>
            <div class="popup-actions">
                <button class="popup-btn edit-btn">✏️ 编辑</button>
                <button class="popup-btn delete-btn">🗑️ 删除</button>
                <button class="popup-btn close-btn">关闭</button>
            </div>
        </div>
    `;

    // 智能定位弹窗
    document.body.appendChild(popup);

    const rect = event.target ? event.target.getBoundingClientRect() : { left: event.clientX || 0, top: event.clientY || 0, bottom: (event.clientY || 0) + 20 };
    const popupRect = popup.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = rect.left;
    let top = rect.bottom + 5;

    // 防止弹窗超出右边界
    if (left + popupRect.width > viewportWidth) {
        left = viewportWidth - popupRect.width - 10;
    }

    // 防止弹窗超出下边界
    if (top + popupRect.height > viewportHeight) {
        top = rect.top - popupRect.height - 5;
    }

    popup.style.position = 'fixed';
    popup.style.left = `${Math.max(10, left)}px`;
    popup.style.top = `${Math.max(10, top)}px`;
    popup.style.zIndex = '1000';

    // 添加事件监听
    const titleInput = popup.querySelector('.popup-title-input');
    const editBtn = popup.querySelector('.edit-btn');
    const deleteBtn = popup.querySelector('.delete-btn');
    const closeBtn = popup.querySelector('.close-btn');

    let isEditing = false;

    editBtn.addEventListener('click', () => {
        if (!isEditing) {
            titleInput.disabled = false;
            titleInput.focus();
            titleInput.select();
            editBtn.textContent = '💾 保存';
            isEditing = true;
        } else {
            const newText = titleInput.value.trim();
            if (newText && newText !== task.text) {
                task.text = newText;
                updateEventInCalendar(task);
                saveTasks();
                renderTasks();
            }
            titleInput.disabled = true;
            editBtn.textContent = '✏️ 编辑';
            isEditing = false;
        }
    });

    deleteBtn.addEventListener('click', () => {
        if (confirm('确定要删除这个任务吗？')) {
            tasks = tasks.filter(t => t.id !== task.id);
            removeEventFromCalendar(task.id);
            saveTasks();
            renderTasks();
            popup.remove();
        }
    });

    closeBtn.addEventListener('click', () => {
        popup.remove();
    });

    // 点击外部关闭弹窗
    document.addEventListener('click', function closePopup(e) {
        if (!popup.contains(e.target)) {
            popup.remove();
            document.removeEventListener('click', closePopup);
        }
    });

    titleInput.disabled = true;
};

// 显示当天所有任务的弹窗
const showDayTasksPopup = (dayTasks, event, date) => {
    // 移除已存在的弹窗
    const existingPopup = document.querySelector('.custom-day-tasks-popup');
    if (existingPopup) {
        existingPopup.remove();
    }

    const popup = document.createElement('div');
    popup.className = 'custom-day-tasks-popup';

    const tasksHtml = dayTasks.map(task => `
        <div class="day-task-item" data-task-id="${task.id}">
            <span class="priority-dot ${task.priority}"></span>
            <span class="task-title">${escapeHTML(task.text)}</span>
            <span class="task-time">${task.completedAt ? new Date(task.completedAt).toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'}) : '未知时间'}</span>
        </div>
    `).join('');

    popup.innerHTML = `
        <div class="popup-content">
            <div class="popup-header">
                <h4>${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 完成的任务</h4>
                <button class="popup-close-btn">&times;</button>
            </div>
            <div class="day-tasks-list">
                ${tasksHtml}
            </div>
        </div>
    `;

    // 智能定位弹窗
    document.body.appendChild(popup);

    const rect = event.target ? event.target.getBoundingClientRect() : { left: event.clientX || 0, top: event.clientY || 0, bottom: (event.clientY || 0) + 20 };
    const popupRect = popup.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = rect.left;
    let top = rect.bottom + 5;

    // 防止弹窗超出右边界
    if (left + popupRect.width > viewportWidth) {
        left = viewportWidth - popupRect.width - 10;
    }

    // 防止弹窗超出下边界
    if (top + popupRect.height > viewportHeight) {
        top = rect.top - popupRect.height - 5;
    }

    popup.style.position = 'fixed';
    popup.style.left = `${Math.max(10, left)}px`;
    popup.style.top = `${Math.max(10, top)}px`;
    popup.style.zIndex = '1000';

    // 添加事件监听
    const closeBtn = popup.querySelector('.popup-close-btn');
    closeBtn.addEventListener('click', () => {
        popup.remove();
    });

    // 点击任务项显示详情
    popup.querySelectorAll('.day-task-item').forEach(item => {
        item.addEventListener('click', () => {
            const taskId = parseInt(item.dataset.taskId);
            const task = tasks.find(t => t.id === taskId);
            if (task) {
                popup.remove();
                showTaskDetailPopup(task, event);
            }
        });
    });

    // 点击外部关闭弹窗
    document.addEventListener('click', function closeDayPopup(e) {
        if (!popup.contains(e.target)) {
            popup.remove();
            document.removeEventListener('click', closeDayPopup);
        }
    });
};

// --- Initialization ---
const loadState = () => {
    const savedTasks = localStorage.getItem('tasks');
    tasks = savedTasks ? JSON.parse(savedTasks) : [];

    // 加载番茄钟设置和状态
    const savedTimerSettings = localStorage.getItem('timerSettings');
    if(savedTimerSettings) {
        try {
             const settings = JSON.parse(savedTimerSettings);
             workDuration = parseInt(settings.workDuration, 10) || 25 * 60;
             breakDuration = parseInt(settings.breakDuration, 10) || 5 * 60;
             completedCycles = parseInt(settings.completedCycles, 10) || 0;

             // 恢复番茄钟状态
             if (settings.timeLeft !== undefined) {
                 timeLeft = parseInt(settings.timeLeft, 10) || workDuration;
             } else {
                 timeLeft = workDuration;
             }

             if (settings.currentMode) {
                 currentMode = settings.currentMode;
             }

             // 恢复会话开始时间（如果存在且是今天的）
             if (settings.currentSessionStartTime) {
                 const sessionStartTime = new Date(settings.currentSessionStartTime);
                 const today = new Date();
                 // 只有是今天的会话才恢复
                 if (sessionStartTime.toDateString() === today.toDateString()) {
                     currentSessionStartTime = sessionStartTime;
                 }
             }

             // 恢复时间戳信息
             if (settings.timerStartTime) {
                 timerStartTime = new Date(settings.timerStartTime);
             }
             if (settings.timerEndTime) {
                 timerEndTime = new Date(settings.timerEndTime);
             }

             // 处理后台运行的计时器恢复
             if (settings.isRunning && timerEndTime) {
                 const now = new Date();

                 // 检查计时器是否应该已经结束
                 if (now >= timerEndTime) {
                     // 计算超时了多长时间
                     let overtimeMs = now.getTime() - timerEndTime.getTime();

                     // 处理可能的多次模式切换
                     while (overtimeMs > 0) {
                         if (currentMode === 'work') {
                             // 工作时间结束，记录专注时间并切换到休息
                             if (currentSessionStartTime) {
                                 const workDuration = Math.floor((timerEndTime - currentSessionStartTime) / 1000);
                                 if (workDuration > 0) {
                                     dailyFocusTime += workDuration;
                                     focusHistory.push({
                                         date: getTodayDateString(),
                                         startTime: currentSessionStartTime.toISOString(),
                                         endTime: timerEndTime.toISOString(),
                                         duration: workDuration
                                     });
                                 }
                                 currentSessionStartTime = null;
                             }
                             currentMode = 'break';
                             const breakMs = breakDuration * 1000;
                             if (overtimeMs >= breakMs) {
                                 // 休息时间也结束了
                                 overtimeMs -= breakMs;
                                 timerEndTime = new Date(timerEndTime.getTime() + breakMs);
                             } else {
                                 // 还在休息中
                                 timeLeft = breakDuration - Math.floor(overtimeMs / 1000);
                                 timerEndTime = new Date(timerEndTime.getTime() + breakMs);
                                 overtimeMs = 0;
                             }
                         } else {
                             // 休息时间结束，完成一个循环
                             completedCycles++;
                             currentMode = 'work';
                             const workMs = workDuration * 1000;
                             if (overtimeMs >= workMs) {
                                 // 工作时间也结束了
                                 overtimeMs -= workMs;
                                 timerEndTime = new Date(timerEndTime.getTime() + workMs);
                             } else {
                                 // 还在工作中
                                 timeLeft = workDuration - Math.floor(overtimeMs / 1000);
                                 timerEndTime = new Date(timerEndTime.getTime() + workMs);
                                 if (currentMode === 'work') {
                                     currentSessionStartTime = new Date(timerEndTime.getTime() - workMs);
                                 }
                                 overtimeMs = 0;
                             }
                         }
                     }

                     if (overtimeMs <= 0 && timeLeft > 0) {
                         // 恢复计时器
                         isRunning = true;
                         timerStartTime = new Date(timerEndTime.getTime() - timeLeft * 1000);
                         if (timerInterval) clearInterval(timerInterval);
                         timerInterval = setInterval(tick, 1000);
                     } else {
                         isRunning = false;
                         timerStartTime = null;
                         timerEndTime = null;
                     }
                 } else {
                     // 计时器还在运行中
                     const remainingMs = timerEndTime.getTime() - now.getTime();
                     timeLeft = Math.ceil(remainingMs / 1000);
                     isRunning = true;
                     if (timerInterval) clearInterval(timerInterval);
                     timerInterval = setInterval(tick, 1000);
                 }
             } else {
                 isRunning = false;
                 timerStartTime = null;
                 timerEndTime = null;
             }

        } catch(e) { }
    } else {
        timeLeft = workDuration;
    }

    // 加载专注时间历史
    const savedFocusHistory = localStorage.getItem('focusHistory');
    if (savedFocusHistory) {
        try {
            const focusData = JSON.parse(savedFocusHistory);
            const today = getTodayDateString();
            if (focusData.date === today) {
                dailyFocusTime = focusData.totalTime || 0;
                focusHistory = focusData.history || [];
            } else {
                // 新的一天，重置专注时间
                dailyFocusTime = 0;
                focusHistory = [];
            }
        } catch(e) { }
    }

    const savedUiSettings = localStorage.getItem('uiSettings');
    if (savedUiSettings) {
        try {
            const ui = JSON.parse(savedUiSettings);
            currentTheme = ui.theme || 'blue-grey';
            currentUiMode = ui.mode || 'light';
            currentLang = ui.lang || 'zh';
        } catch(e) { }
    }

    const savedCountdownData = localStorage.getItem('countdownData');
    if (savedCountdownData) {
        try {
            const countdownData = JSON.parse(savedCountdownData);
            targetTitleInput.value = countdownData.title || '';
            targetDateInput.value = countdownData.date || '';
        } catch(e) { }
    }

     applyTheme(currentTheme);
     applyMode(currentUiMode);
     applyLanguage(currentLang);
     renderTasks();
     updateDisplay();
     addTaskBtn.disabled = taskInput.value.trim() === '';
     initCalendar();
     updateCountdown();
};

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
   loadState();
   new Sortable(taskList, {
       animation: 150,
       handle: '.draggable-handle',
       ghostClass: 'sortable-ghost',
       onEnd: (evt) => {
           const item = tasks.splice(evt.oldIndex, 1)[0];
           tasks.splice(evt.newIndex, 0, item);
           saveTasks();
       }
   });
   targetDateInput.addEventListener('change', updateCountdown);
   targetTitleInput.addEventListener('input', updateCountdown);
   stopwatchStartBtn.addEventListener('click', toggleStopwatch);
   stopwatchResetBtn.addEventListener('click', resetStopwatch);
   shareBtn.addEventListener('click', shareProgress);
});
taskForm.addEventListener('submit', addTask);
 taskInput.addEventListener('input', (e) => { addTaskBtn.disabled = e.target.value.trim() === ''; });
taskList.addEventListener('click', handleTaskAction);
priorityBtns.forEach(btn => btn.addEventListener('click', setPriority));
startPauseBtn.addEventListener('click', toggleTimer);
resetBtn.addEventListener('click', () => resetTimer(false));
skipBtn.addEventListener('click', skipTimer);
resetFocusTimeBtn.addEventListener('click', resetDailyFocusTime);
// Timer Settings Modal
settingsOpenBtn.addEventListener('click', openTimerSettings);
settingsCancelBtn.addEventListener('click', closeTimerSettings);
settingsSaveBtn.addEventListener('click', saveTimerSettingsAction);
settingsModal.addEventListener('click', (e) => { if(e.target === settingsModal) closeTimerSettings(); });
// New Theme FAB
themeFabBtn.addEventListener('click', () => themePanel.classList.toggle('show'));
document.addEventListener('click', (e) => {
    if (!themeFabBtn.contains(e.target) && !themePanel.contains(e.target)) {
        themePanel.classList.remove('show');
    }
});
themeSelectorPanel.addEventListener('click', handleThemeChange);
darkModeCheckbox.addEventListener('change', (e) => {
    const mode = e.target.checked ? 'dark' : 'light';
    applyMode(mode);
    saveUiSettings();
});
langCheckbox.addEventListener('change', (e) => {
    const lang = e.target.checked ? 'en' : 'zh';
    applyLanguage(lang);
    saveUiSettings();
});
document.querySelector('.priority-options').addEventListener('click', (e) => { if (e.target.classList.contains('priority-btn')) { e.preventDefault(); } });
// 滑块事件监听
workDurationSlider.addEventListener('input', (e) => { workDurationValue.textContent = e.target.value; });
breakDurationSlider.addEventListener('input', (e) => { breakDurationValue.textContent = e.target.value; });
// 日历控制事件监听 (优化)
calendarNav.addEventListener('click', (e) => {
    if (e.target.id === 'calendar-prev') calendar.prev();
    if (e.target.id === 'calendar-next') calendar.next();
    if (e.target.id === 'calendar-today') calendar.today();
    setCalendarTitle();
});
// 移除视图切换事件监听，因为只有日视图

// 页面卸载时保存状态
window.addEventListener('beforeunload', () => {
    if (isRunning) {
        // 如果正在运行，先暂停并保存状态
        pauseTimer();
    } else {
        // 否则直接保存当前状态
        saveTimerState();
    }
});

// 页面可见性变化时的处理
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // 页面隐藏时保存当前状态，但不暂停计时器
        saveTimerState();
    } else {
        // 页面重新可见时，基于时间戳同步状态
        if (isRunning) {
            updateTimerFromTimestamp();
        }
    }
});