/**
 * AI EXAM PROCTOR - Main Application
 * ===================================
 * Complete exam proctoring system with:
 * - Face detection & gaze tracking (MediaPipe)
 * - Keystroke analysis & behavior detection
 * - Tab switching & focus monitoring
 * - Clipboard analysis
 * - Audio monitoring
 * - Oral verification
 */

// ============================================
// GLOBAL STATE
// ============================================
const state = {
    student: { name: '', id: '' },
    exam: {
        currentQuestion: 0,
        answers: [],
        startTime: null,
        duration: 30 * 60, // 30 minutes in seconds
        timeRemaining: 30 * 60
    },
    proctoring: {
        warnings: 0,
        maxWarnings: 5,
        tabSwitches: 0,
        focusLosses: 0,
        pasteEvents: 0,
        gazeAway: 0,
        typingBursts: 0,
        logs: []
    },
    typing: {
        lastKeyTime: 0,
        keyIntervals: [],
        burstThreshold: 50, // ms - keys faster than this are burst typing
        burstCount: 0
    },
    audio: {
        context: null,
        analyser: null,
        isSpeaking: false
    },
    face: {
        mesh: null,
        isLookingAway: false,
        lookAwayStart: null,
        gazeThreshold: 0.15
    },
    verification: {
        currentQuestion: 0,
        responses: []
    },
    mediaStream: null,
    isSetupComplete: false
};

// Exam questions
const examQuestions = [
    {
        id: 1,
        text: "Explain the concept of Object-Oriented Programming (OOP) and list its four main principles with brief descriptions.",
        topic: "OOP Principles"
    },
    {
        id: 2,
        text: "What is the difference between a stack and a queue data structure? Provide examples of real-world applications for each.",
        topic: "Data Structures"
    },
    {
        id: 3,
        text: "Describe what an API (Application Programming Interface) is and explain the difference between REST and GraphQL APIs.",
        topic: "APIs"
    },
    {
        id: 4,
        text: "What is machine learning? Explain the difference between supervised and unsupervised learning with examples.",
        topic: "Machine Learning"
    },
    {
        id: 5,
        text: "Explain the concept of database normalization. What are the benefits and when might you choose to denormalize?",
        topic: "Databases"
    }
];

// Verification questions (based on exam answers)
const verificationQuestions = [
    "You mentioned OOP principles in your answer. Can you explain polymorphism in your own words?",
    "Can you describe a real-world scenario where you would use a queue over a stack?",
    "How would you explain API authentication to someone new to programming?"
];

// ============================================
// UTILITY FUNCTIONS
// ============================================
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getTimestamp() {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// ============================================
// LOGGING SYSTEM
// ============================================
function addLog(message, type = 'info') {
    const logContainer = document.getElementById('activity-log');
    const timestamp = getTimestamp();

    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `
        <span class="log-time">${timestamp}</span>
        ${message}
    `;

    logContainer.insertBefore(logEntry, logContainer.firstChild);

    // Store in state
    state.proctoring.logs.push({ time: timestamp, message, type });

    // Keep only last 50 logs in DOM
    while (logContainer.children.length > 50) {
        logContainer.removeChild(logContainer.lastChild);
    }
}

// ============================================
// WARNING SYSTEM
// ============================================
function showWarning(title, message) {
    state.proctoring.warnings++;
    document.getElementById('warning-count').textContent = state.proctoring.warnings;

    addLog(`⚠️ WARNING: ${message}`, 'danger');

    // Show modal
    document.getElementById('warning-title').textContent = title;
    document.getElementById('warning-message').textContent = message;
    document.getElementById('warning-modal').classList.add('active');

    // Check if max warnings reached
    if (state.proctoring.warnings >= state.proctoring.maxWarnings) {
        setTimeout(() => {
            alert('Maximum warnings exceeded. Your exam will be terminated.');
            endExam(true);
        }, 1000);
    }
}

document.getElementById('dismiss-warning')?.addEventListener('click', () => {
    document.getElementById('warning-modal').classList.remove('active');
});

// ============================================
// CAMERA & MEDIAPIPE SETUP
// ============================================
async function initCamera() {
    try {
        state.mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: 'user' },
            audio: true
        });

        document.getElementById('preview-video').srcObject = state.mediaStream;
        document.getElementById('check-camera').classList.add('passed');
        document.getElementById('check-camera').querySelector('.check-icon').textContent = '✅';

        // Setup audio monitoring
        initAudioMonitor(state.mediaStream);
        document.getElementById('check-mic').classList.add('passed');
        document.getElementById('check-mic').querySelector('.check-icon').textContent = '✅';

        return true;
    } catch (err) {
        console.error('Camera error:', err);
        document.getElementById('check-camera').classList.add('failed');
        document.getElementById('check-camera').querySelector('.check-icon').textContent = '❌';
        document.getElementById('check-mic').classList.add('failed');
        document.getElementById('check-mic').querySelector('.check-icon').textContent = '❌';
        return false;
    }
}

async function initFaceMesh() {
    try {
        const faceMesh = new FaceMesh({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        faceMesh.onResults(onFaceResults);
        state.face.mesh = faceMesh;

        document.getElementById('check-face').classList.add('passed');
        document.getElementById('check-face').querySelector('.check-icon').textContent = '✅';
        document.getElementById('face-status').textContent = 'Face detection ready';

        return true;
    } catch (err) {
        console.error('FaceMesh error:', err);
        document.getElementById('check-face').classList.add('failed');
        document.getElementById('check-face').querySelector('.check-icon').textContent = '❌';
        return false;
    }
}

function onFaceResults(results) {
    const canvas = state.isSetupComplete ?
        document.getElementById('exam-canvas') :
        document.getElementById('preview-canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];

        // Draw face mesh outline
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
        ctx.lineWidth = 1;

        // Get eye landmarks for gaze detection
        const leftEye = landmarks[468]; // Left eye center
        const rightEye = landmarks[473]; // Right eye center
        const nose = landmarks[1]; // Nose tip

        // Calculate gaze direction
        const eyeCenter = {
            x: (leftEye.x + rightEye.x) / 2,
            y: (leftEye.y + rightEye.y) / 2
        };

        // Check if looking away (eyes/nose position relative to center)
        const isLookingLeft = nose.x < 0.35;
        const isLookingRight = nose.x > 0.65;
        const isLookingUp = nose.y < 0.35;
        const isLookingDown = nose.y > 0.65;

        const isLookingAway = isLookingLeft || isLookingRight || isLookingUp || isLookingDown;

        // Update gaze indicator (smaller corner version)
        if (state.isSetupComplete) {
            const gazeDot = document.querySelector('.gaze-dot');

            // Move dot within small container based on gaze
            const offsetX = (nose.x - 0.5) * 30; // Smaller movement range
            const offsetY = (nose.y - 0.5) * 30;

            gazeDot.style.transform = `translate(${offsetX}px, ${offsetY}px)`;

            if (isLookingAway) {
                gazeDot.style.background = '#ef4444';
                gazeDot.style.boxShadow = '0 0 8px #ef4444';

                if (!state.face.isLookingAway) {
                    state.face.isLookingAway = true;
                    state.face.lookAwayStart = Date.now();
                }

                // Warn after 3 seconds of looking away
                if (Date.now() - state.face.lookAwayStart > 3000) {
                    state.proctoring.gazeAway++;
                    document.getElementById('stat-gaze').textContent = state.proctoring.gazeAway;
                    showWarning('Gaze Warning', 'Please keep your eyes on the screen during the exam.');
                    state.face.lookAwayStart = Date.now();
                }
            } else {
                gazeDot.style.background = '#6366f1';
                gazeDot.style.boxShadow = '0 0 6px #6366f1';
                state.face.isLookingAway = false;
            }
        }

        // Draw face bounding box
        let minX = 1, maxX = 0, minY = 1, maxY = 0;
        landmarks.forEach(landmark => {
            minX = Math.min(minX, landmark.x);
            maxX = Math.max(maxX, landmark.x);
            minY = Math.min(minY, landmark.y);
            maxY = Math.max(maxY, landmark.y);
        });

        ctx.strokeStyle = isLookingAway ? 'rgba(239, 68, 68, 0.8)' : 'rgba(16, 185, 129, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            minX * canvas.width,
            minY * canvas.height,
            (maxX - minX) * canvas.width,
            (maxY - minY) * canvas.height
        );

        // Face status
        if (!state.isSetupComplete) {
            document.getElementById('face-status').textContent = '✅ Face detected';
            document.getElementById('face-status').style.color = '#10b981';
        }
    } else {
        if (!state.isSetupComplete) {
            document.getElementById('face-status').textContent = '⚠️ No face detected';
            document.getElementById('face-status').style.color = '#f59e0b';
        } else {
            // Face not detected during exam
            addLog('Face not detected in frame', 'warning');
        }
    }
}

async function startFaceDetection(video) {
    const camera = new Camera(video, {
        onFrame: async () => {
            if (state.face.mesh) {
                await state.face.mesh.send({ image: video });
            }
        },
        width: 640,
        height: 480
    });
    camera.start();
}

// ============================================
// AUDIO MONITORING
// ============================================
function initAudioMonitor(stream) {
    state.audio.context = new (window.AudioContext || window.webkitAudioContext)();
    state.audio.analyser = state.audio.context.createAnalyser();

    const source = state.audio.context.createMediaStreamSource(stream);
    source.connect(state.audio.analyser);

    state.audio.analyser.fftSize = 256;
    const bufferLength = state.audio.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function updateAudioVisualizer() {
        if (!state.isSetupComplete) {
            requestAnimationFrame(updateAudioVisualizer);
            return;
        }

        state.audio.analyser.getByteFrequencyData(dataArray);

        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
        }
        const average = sum / bufferLength;

        // Update visualizer bars
        const bars = document.querySelectorAll('.audio-bar');
        bars.forEach((bar, i) => {
            const value = dataArray[i * Math.floor(bufferLength / 5)] / 255;
            bar.style.height = `${5 + value * 35}px`;
        });

        // Detect speaking
        const audioStatus = document.getElementById('audio-status');
        if (average > 30) {
            if (!state.audio.isSpeaking) {
                state.audio.isSpeaking = true;
                audioStatus.textContent = 'Speaking Detected';
                audioStatus.classList.add('speaking');
                addLog('🎤 Speaking detected', 'warning');
            }
        } else {
            if (state.audio.isSpeaking) {
                state.audio.isSpeaking = false;
                audioStatus.textContent = 'Silent';
                audioStatus.classList.remove('speaking');
            }
        }

        requestAnimationFrame(updateAudioVisualizer);
    }

    updateAudioVisualizer();
}

// ============================================
// FULLSCREEN HANDLING
// ============================================
let fullscreenWarningShown = false;

async function requestFullscreen() {
    try {
        if (document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
            await document.documentElement.webkitRequestFullscreen();
        } else if (document.documentElement.msRequestFullscreen) {
            await document.documentElement.msRequestFullscreen();
        }
        document.getElementById('check-fullscreen').classList.add('passed');
        document.getElementById('check-fullscreen').querySelector('.check-icon').textContent = '✅';
        fullscreenWarningShown = false;
        return true;
    } catch (err) {
        console.error('Fullscreen error:', err);
        // Fullscreen might be blocked - continue anyway but log it
        addLog('Fullscreen request blocked by browser', 'warning');
        return false;
    }
}

document.addEventListener('fullscreenchange', () => {
    if (state.isSetupComplete && !document.fullscreenElement && !fullscreenWarningShown) {
        fullscreenWarningShown = true;
        state.proctoring.focusLosses++;
        document.getElementById('stat-focus').textContent = state.proctoring.focusLosses;
        addLog('🖥️ Exited fullscreen mode', 'danger');
        showWarning('Fullscreen Exit!', 'You exited fullscreen mode. Please stay in fullscreen during the exam.');

        // Try to re-enter fullscreen after a delay
        setTimeout(() => {
            requestFullscreen();
        }, 1000);
    }
});

// Keyboard shortcut to re-enter fullscreen
document.addEventListener('keydown', (e) => {
    if (state.isSetupComplete && e.key === 'F11') {
        e.preventDefault();
        requestFullscreen();
    }
});

// ============================================
// TAB SWITCHING & FOCUS DETECTION (ENHANCED)
// ============================================
let tabSwitchCount = 0;
let lastTabSwitchTime = null;
let isPageVisible = true;

// Create visual overlay for tab switch warning
function showTabSwitchOverlay() {
    let overlay = document.getElementById('tab-switch-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'tab-switch-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(239, 68, 68, 0.9);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            color: white;
            font-size: 24px;
            text-align: center;
            animation: fadeIn 0.3s ease;
        `;
        overlay.innerHTML = `
            <div style="font-size: 80px; margin-bottom: 20px;">⚠️</div>
            <h1 style="margin-bottom: 10px;">TAB SWITCH DETECTED!</h1>
            <p style="font-size: 18px; opacity: 0.9;">This violation has been recorded.</p>
            <p style="font-size: 16px; margin-top: 20px; opacity: 0.7;">Click anywhere to dismiss</p>
        `;
        overlay.onclick = () => {
            overlay.remove();
        };
        document.body.appendChild(overlay);
    }

    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (overlay && overlay.parentNode) {
            overlay.remove();
        }
    }, 3000);
}

// Primary detection: Visibility API
document.addEventListener('visibilitychange', () => {
    if (!state.isSetupComplete) return;

    const wasVisible = isPageVisible;
    isPageVisible = !document.hidden;

    console.log('[PROCTOR] Visibility changed:', document.hidden ? 'HIDDEN' : 'VISIBLE');

    if (document.hidden) {
        // Page became hidden - user switched away
        tabSwitchCount++;
        state.proctoring.tabSwitches = tabSwitchCount;
        lastTabSwitchTime = new Date().toLocaleTimeString();
        console.log('[PROCTOR] TAB SWITCH #' + tabSwitchCount + ' at ' + lastTabSwitchTime);
    } else if (wasVisible === false) {
        // Page became visible again - show warning NOW
        document.getElementById('stat-tabs').textContent = state.proctoring.tabSwitches;
        addLog(`🚨 TAB SWITCH DETECTED (Switch #${tabSwitchCount} at ${lastTabSwitchTime})`, 'danger');

        // Show prominent overlay
        showTabSwitchOverlay();

        // Also show the modal warning
        showWarning('Tab Switch Detected!', `You switched away at ${lastTabSwitchTime}. This is violation #${tabSwitchCount}.`);
    }
});

// Secondary detection: Window blur/focus
let blurTime = null;
window.addEventListener('blur', () => {
    if (!state.isSetupComplete) return;
    blurTime = Date.now();
    console.log('[PROCTOR] Window blur at', new Date().toLocaleTimeString());
});

window.addEventListener('focus', () => {
    if (!state.isSetupComplete) return;

    // If we were blurred for more than 500ms, count as focus loss
    if (blurTime && (Date.now() - blurTime > 500)) {
        state.proctoring.focusLosses++;
        document.getElementById('stat-focus').textContent = state.proctoring.focusLosses;
        addLog('⚠️ Window focus lost and restored', 'warning');
    }
    blurTime = null;
});

// ============================================
// BEHAVIORAL LEARNING (Baseline + Anomaly Detection)
// ============================================
const behaviorBaseline = {
    typingIntervals: [],
    avgTypingSpeed: 0,
    typingVariance: 0,
    baselineEstablished: false,
    anomalyScore: 0
};

function updateBehaviorBaseline(interval) {
    behaviorBaseline.typingIntervals.push(interval);

    // Establish baseline after 20 keystrokes
    if (behaviorBaseline.typingIntervals.length >= 20 && !behaviorBaseline.baselineEstablished) {
        const intervals = behaviorBaseline.typingIntervals;
        behaviorBaseline.avgTypingSpeed = intervals.reduce((a, b) => a + b, 0) / intervals.length;

        // Calculate variance
        const squaredDiffs = intervals.map(i => Math.pow(i - behaviorBaseline.avgTypingSpeed, 2));
        behaviorBaseline.typingVariance = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / intervals.length);

        behaviorBaseline.baselineEstablished = true;
        addLog(`📊 Behavior baseline established (avg: ${Math.round(behaviorBaseline.avgTypingSpeed)}ms, σ: ${Math.round(behaviorBaseline.typingVariance)}ms)`, 'info');
    }

    // Detect anomalies after baseline is established
    if (behaviorBaseline.baselineEstablished) {
        const deviation = Math.abs(interval - behaviorBaseline.avgTypingSpeed);
        const threshold = behaviorBaseline.typingVariance * 3; // 3 sigma rule

        if (deviation > threshold && interval < 30) {
            // Anomalously fast typing (potential automation or paste)
            behaviorBaseline.anomalyScore += 0.5;
            if (behaviorBaseline.anomalyScore > 5) {
                addLog('🤖 Anomalous typing pattern detected (too fast)', 'warning');
                behaviorBaseline.anomalyScore = 0;
            }
        }
    }
}

// Export behavior baseline for results
function getBehaviorScore() {
    if (!behaviorBaseline.baselineEstablished) return 100;

    const anomalyPenalty = Math.min(behaviorBaseline.anomalyScore * 5, 30);
    return Math.max(0, 100 - anomalyPenalty);
}

// ============================================
// CLIPBOARD MONITORING
// ============================================
document.addEventListener('paste', (e) => {
    if (state.isSetupComplete) {
        state.proctoring.pasteEvents++;
        document.getElementById('stat-paste').textContent = state.proctoring.pasteEvents;

        const clipboardData = e.clipboardData.getData('text');
        const preview = clipboardData.substring(0, 50);
        addLog(`📋 Paste detected: "${preview}${clipboardData.length > 50 ? '...' : ''}"`, 'danger');

        if (state.proctoring.pasteEvents >= 2) {
            showWarning('Paste Detected', 'Multiple paste operations detected. This is flagged as suspicious behavior.');
        }
    }
});

// Prevent copy
document.addEventListener('copy', (e) => {
    if (state.isSetupComplete) {
        addLog('Copy attempt blocked', 'warning');
        e.preventDefault();
    }
});

// ============================================
// KEYSTROKE ANALYSIS (with behavioral learning)
// ============================================
function initKeystrokeAnalysis() {
    const answerInput = document.getElementById('answer-input');

    answerInput.addEventListener('keydown', (e) => {
        const now = Date.now();

        if (state.typing.lastKeyTime > 0) {
            const interval = now - state.typing.lastKeyTime;
            state.typing.keyIntervals.push(interval);

            // Feed to behavioral learning system
            updateBehaviorBaseline(interval);

            // Detect burst typing (suspiciously fast, like pasting or scripted input)
            if (interval < state.typing.burstThreshold) {
                state.typing.burstCount++;

                if (state.typing.burstCount >= 10) {
                    state.proctoring.typingBursts++;
                    document.getElementById('stat-bursts').textContent = state.proctoring.typingBursts;
                    addLog('⚡ Burst typing detected (suspiciously fast)', 'warning');
                    state.typing.burstCount = 0;
                }
            } else {
                state.typing.burstCount = Math.max(0, state.typing.burstCount - 1);
            }
        }

        state.typing.lastKeyTime = now;
    });

    // Update typing stats display
    answerInput.addEventListener('input', () => {
        const text = answerInput.value;
        document.getElementById('char-count').textContent = `${text.length} characters`;

        // Calculate WPM
        if (state.typing.keyIntervals.length > 10) {
            const avgInterval = state.typing.keyIntervals.slice(-20).reduce((a, b) => a + b, 0) / 20;
            const wpm = Math.round((60000 / avgInterval) / 5); // Assuming 5 chars per word
            document.getElementById('typing-speed').textContent = `${Math.min(wpm, 200)} WPM`;
        }
    });
}

// ============================================
// QUESTION NAVIGATION
// ============================================
function loadQuestion(index) {
    const question = examQuestions[index];
    const questionCard = document.getElementById('question-card');

    questionCard.innerHTML = `
        <h3>Topic: ${question.topic}</h3>
        <p>${question.text}</p>
    `;

    // Load saved answer
    document.getElementById('answer-input').value = state.exam.answers[index] || '';

    // Update navigation
    document.getElementById('current-q').textContent = index + 1;
    document.getElementById('prev-btn').disabled = index === 0;
    document.getElementById('next-btn').textContent = index === examQuestions.length - 1 ? 'Review' : 'Next →';

    // Update indicators
    updateQuestionIndicators();

    addLog(`Viewing question ${index + 1}`, 'info');
}

function updateQuestionIndicators() {
    const container = document.getElementById('q-indicators');
    container.innerHTML = '';

    examQuestions.forEach((q, i) => {
        const indicator = document.createElement('div');
        indicator.className = 'q-indicator';
        if (i === state.exam.currentQuestion) indicator.classList.add('current');
        if (state.exam.answers[i]) indicator.classList.add('answered');
        indicator.textContent = i + 1;
        indicator.onclick = () => {
            saveCurrentAnswer();
            state.exam.currentQuestion = i;
            loadQuestion(i);
        };
        container.appendChild(indicator);
    });
}

function saveCurrentAnswer() {
    const answer = document.getElementById('answer-input').value;
    state.exam.answers[state.exam.currentQuestion] = answer;
}

// ============================================
// TIMER
// ============================================
function startTimer() {
    const timerDisplay = document.getElementById('time-display');
    const timerElement = document.getElementById('timer');

    const timerInterval = setInterval(() => {
        state.exam.timeRemaining--;
        timerDisplay.textContent = formatTime(state.exam.timeRemaining);

        // Warning when time is low
        if (state.exam.timeRemaining === 300) { // 5 minutes
            timerElement.classList.add('warning');
            addLog('⏰ 5 minutes remaining', 'warning');
        }

        if (state.exam.timeRemaining <= 0) {
            clearInterval(timerInterval);
            addLog('⏰ Time is up!', 'danger');
            endExam(false);
        }
    }, 1000);

    return timerInterval;
}

// ============================================
// EXAM FLOW
// ============================================
async function startExam() {
    const name = document.getElementById('student-name').value.trim();
    const id = document.getElementById('student-id').value.trim();

    if (!name || !id) {
        alert('Please enter your name and student ID');
        return;
    }

    state.student.name = name;
    state.student.id = id;

    // Request fullscreen
    await requestFullscreen();

    // Setup exam screen
    state.isSetupComplete = true;
    showScreen('exam-screen');

    // Setup video for exam
    document.getElementById('exam-video').srcObject = state.mediaStream;
    startFaceDetection(document.getElementById('exam-video'));

    // Display student info
    document.getElementById('student-display').textContent = `${name} (${id})`;

    // Initialize
    document.getElementById('total-q').textContent = examQuestions.length;
    state.exam.answers = new Array(examQuestions.length).fill('');
    loadQuestion(0);
    initKeystrokeAnalysis();

    // Start timer
    state.exam.startTime = Date.now();
    startTimer();

    addLog('Exam started', 'info');
    addLog(`Student: ${name} (${id})`, 'info');
}

function endExam(terminated = false) {
    saveCurrentAnswer();

    if (terminated) {
        addLog('Exam terminated due to violations', 'danger');
    } else {
        addLog('Exam submitted', 'info');
    }

    // Go to verification or results
    startVerification();
}

// ============================================
// ORAL VERIFICATION
// ============================================
let recognition = null;

function startVerification() {
    showScreen('verification-screen');

    document.getElementById('verification-video').srcObject = state.mediaStream;
    startFaceDetection(document.getElementById('verification-video'));

    // Setup speech recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            document.getElementById('transcript-output').textContent = transcript;
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
        };
    }

    loadVerificationQuestion(0);
}

function loadVerificationQuestion(index) {
    const container = document.getElementById('verification-question');
    container.querySelector('.v-question-number').textContent =
        `Question ${index + 1} of ${verificationQuestions.length}`;
    document.getElementById('v-question-text').textContent = verificationQuestions[index];

    // Reset UI
    document.getElementById('transcript-output').textContent = 'Click "Start Speaking" to begin...';
    document.getElementById('recording-status').classList.remove('active');
    document.getElementById('start-speaking').style.display = 'flex';
    document.getElementById('next-v-question').style.display = 'none';
    document.getElementById('complete-verification').style.display = 'none';
}

document.getElementById('start-speaking')?.addEventListener('click', () => {
    if (recognition) {
        recognition.start();
        document.getElementById('recording-status').classList.add('active');
        document.getElementById('start-speaking').style.display = 'none';
        document.getElementById('transcript-output').textContent = 'Listening...';

        // Stop after 30 seconds
        setTimeout(() => {
            recognition.stop();
            document.getElementById('recording-status').classList.remove('active');

            const transcript = document.getElementById('transcript-output').textContent;
            state.verification.responses[state.verification.currentQuestion] = transcript;

            // Show next button
            if (state.verification.currentQuestion < verificationQuestions.length - 1) {
                document.getElementById('next-v-question').style.display = 'block';
            } else {
                document.getElementById('complete-verification').style.display = 'block';
            }
        }, 30000);
    } else {
        alert('Speech recognition not supported. Skipping verification.');
        showResults();
    }
});

document.getElementById('next-v-question')?.addEventListener('click', () => {
    state.verification.currentQuestion++;
    loadVerificationQuestion(state.verification.currentQuestion);
});

document.getElementById('complete-verification')?.addEventListener('click', () => {
    if (recognition) recognition.stop();
    showResults();
});

// ============================================
// RESULTS
// ============================================
function showResults() {
    showScreen('results-screen');

    // Stop media
    if (state.mediaStream) {
        state.mediaStream.getTracks().forEach(track => track.stop());
    }

    // Exit fullscreen
    if (document.fullscreenElement) {
        document.exitFullscreen();
    }

    // Calculate integrity score
    const totalViolations = state.proctoring.warnings +
        state.proctoring.tabSwitches +
        state.proctoring.pasteEvents +
        Math.floor(state.proctoring.gazeAway / 2);

    const score = Math.max(0, 100 - (totalViolations * 15));

    // Update summary
    const summaryGrid = document.getElementById('summary-grid');
    summaryGrid.innerHTML = `
        <div class="summary-item">
            <div class="value">${state.proctoring.tabSwitches}</div>
            <div class="label">Tab Switches</div>
        </div>
        <div class="summary-item">
            <div class="value">${state.proctoring.focusLosses}</div>
            <div class="label">Focus Lost</div>
        </div>
        <div class="summary-item">
            <div class="value">${state.proctoring.pasteEvents}</div>
            <div class="label">Paste Events</div>
        </div>
        <div class="summary-item">
            <div class="value">${state.proctoring.gazeAway}</div>
            <div class="label">Gaze Warnings</div>
        </div>
        <div class="summary-item">
            <div class="value">${state.proctoring.typingBursts}</div>
            <div class="label">Typing Bursts</div>
        </div>
        <div class="summary-item">
            <div class="value">${state.proctoring.warnings}</div>
            <div class="label">Total Warnings</div>
        </div>
    `;

    // Update score
    const scoreCircle = document.getElementById('score-circle');
    document.getElementById('integrity-score').textContent = `${score}%`;

    if (score >= 80) {
        scoreCircle.className = 'score-circle';
        document.getElementById('score-message').textContent = 'Excellent integrity! No significant issues detected.';
    } else if (score >= 50) {
        scoreCircle.className = 'score-circle warning';
        document.getElementById('score-message').textContent = 'Some suspicious activity detected. Manual review recommended.';
    } else {
        scoreCircle.className = 'score-circle danger';
        document.getElementById('score-message').textContent = 'Multiple violations detected. Exam flagged for review.';
    }

    // Warning log
    const warningLogDiv = document.getElementById('warning-log-summary');
    if (state.proctoring.logs.filter(l => l.type !== 'info').length > 0) {
        warningLogDiv.innerHTML = state.proctoring.logs
            .filter(l => l.type !== 'info')
            .slice(0, 10)
            .map(l => `<div class="warning-log-item"><span>${l.message}</span><span>${l.time}</span></div>`)
            .join('');
    } else {
        warningLogDiv.innerHTML = '<p style="text-align:center;color:#64748b;">No warnings recorded</p>';
    }
}

document.getElementById('restart-btn')?.addEventListener('click', () => {
    location.reload();
});

// ============================================
// NAVIGATION HANDLERS
// ============================================
document.getElementById('prev-btn')?.addEventListener('click', () => {
    saveCurrentAnswer();
    if (state.exam.currentQuestion > 0) {
        state.exam.currentQuestion--;
        loadQuestion(state.exam.currentQuestion);
    }
});

document.getElementById('next-btn')?.addEventListener('click', () => {
    saveCurrentAnswer();
    if (state.exam.currentQuestion < examQuestions.length - 1) {
        state.exam.currentQuestion++;
        loadQuestion(state.exam.currentQuestion);
    }
});

document.getElementById('submit-exam-btn')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to submit your exam?')) {
        endExam(false);
    }
});

// ============================================
// INITIALIZATION
// ============================================
async function init() {
    // Check inputs for enabling start button
    const checkInputs = () => {
        const name = document.getElementById('student-name').value.trim();
        const id = document.getElementById('student-id').value.trim();
        const allChecksPassed = document.querySelectorAll('.check-item.passed').length >= 3;
        document.getElementById('start-exam-btn').disabled = !(name && id && allChecksPassed);
    };

    document.getElementById('student-name').addEventListener('input', checkInputs);
    document.getElementById('student-id').addEventListener('input', checkInputs);

    // Initialize camera and face mesh
    await initCamera();
    await initFaceMesh();

    // Start preview face detection
    const previewVideo = document.getElementById('preview-video');
    previewVideo.onloadedmetadata = () => {
        startFaceDetection(previewVideo);
    };

    // Check fullscreen capability
    if (document.documentElement.requestFullscreen) {
        document.getElementById('check-fullscreen').classList.add('passed');
        document.getElementById('check-fullscreen').querySelector('.check-icon').textContent = '✅';
    }

    checkInputs();
}

// Start button handler
document.getElementById('start-exam-btn')?.addEventListener('click', startExam);

// Initialize on load
window.addEventListener('load', init);

// Prevent right-click context menu during exam
document.addEventListener('contextmenu', (e) => {
    if (state.isSetupComplete) {
        e.preventDefault();
        addLog('Right-click blocked', 'info');
    }
});

// Prevent keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (state.isSetupComplete) {
        // Block common shortcuts
        if (e.ctrlKey && (e.key === 'c' || e.key === 'v' || e.key === 'a' || e.key === 'p')) {
            if (e.key !== 'v') { // Allow paste for detection
                e.preventDefault();
                addLog(`Keyboard shortcut Ctrl+${e.key.toUpperCase()} blocked`, 'info');
            }
        }

        // Block Alt+Tab indicator
        if (e.altKey && e.key === 'Tab') {
            addLog('Alt+Tab attempted', 'warning');
        }

        // Block F12, Ctrl+Shift+I
        if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
            e.preventDefault();
            addLog('Developer tools blocked', 'warning');
        }
    }
});
