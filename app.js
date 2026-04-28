import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getDatabase, ref, push, update, remove, onChildAdded, onChildChanged, onChildRemoved } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBgCwjrq5qQcqyEpErjUd5rF_iHM3PIA84",
  authDomain: "ima-project-a-new-start.firebaseapp.com",
  databaseURL: "https://ima-project-a-new-start-default-rtdb.firebaseio.com",
  projectId: "ima-project-a-new-start",
  storageBucket: "ima-project-a-new-start.firebasestorage.app",
  messagingSenderId: "129146696043",
  appId: "1:129146696043:web:cd7daeb95153d841e35c2e",
  measurementId: "G-2HWBJKSZ1S"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const messagesRef = ref(db, "canvas_messages");

// No fixed color palettes anymore, colors are infinitely generated.

// DOM Elements
const loginOverlay = document.getElementById("login-overlay");
const googleSignInBtn = document.getElementById("google-signin-btn");
const form = document.getElementById("message-form");
const input = document.getElementById("message-input");
const canvasViewport = document.getElementById("canvas-viewport");
const canvasContainer = document.getElementById("canvas-container");
const adminClearBtn = document.getElementById("admin-clear-btn");

// State
let isSubmitting = false;
let userName = "Anonymous";
let userColor = "#111";
let userId = null;
const messageElements = {};

// --- Camera System (Infinite Canvas) ---
let camera = { x: 0, y: 0, z: 1 };

function updateCameraTransform() {
  canvasContainer.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})`;
  // Update background grid to match camera offset and zoom
  canvasViewport.style.backgroundPosition = `${camera.x}px ${camera.y}px`;
  canvasViewport.style.backgroundSize = `${20 * camera.z}px ${20 * camera.z}px`;
}

// 1. Zoom Logic
canvasViewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  const zoomSensitivity = 0.0015;
  const delta = -e.deltaY * zoomSensitivity;
  const newScale = Math.min(Math.max(0.1, camera.z + delta), 5); // Clamped between 0.1x to 5x

  if (newScale === camera.z) return; // Ignore if at limits

  // Calculate zoom focus (zoom towards the cursor)
  // X and Y relative to old scale
  const pointerX = e.clientX;
  const pointerY = e.clientY;
  
  const targetX = (pointerX - camera.x) / camera.z;
  const targetY = (pointerY - camera.y) / camera.z;

  camera.z = newScale;
  camera.x = pointerX - (targetX * camera.z);
  camera.y = pointerY - (targetY * camera.z);

  updateCameraTransform();
}, { passive: false });

// 2. Pan Logic
let isPanning = false;
let startPanMouseX, startPanMouseY;
let startPanCameraX, startPanCameraY;

canvasViewport.addEventListener('mousedown', (e) => {
  // Only pan with left click on the empty canvas area
  if (e.button !== 0 || e.target.closest('.canvas-message')) return;
  
  isPanning = true;
  canvasViewport.classList.add('dragging');
  startPanMouseX = e.clientX;
  startPanMouseY = e.clientY;
  startPanCameraX = camera.x;
  startPanCameraY = camera.y;
});

window.addEventListener('mousemove', (e) => {
  if (!isPanning) return;
  const dx = e.clientX - startPanMouseX;
  const dy = e.clientY - startPanMouseY;
  camera.x = startPanCameraX + dx;
  camera.y = startPanCameraY + dy;
  updateCameraTransform();
});

window.addEventListener('mouseup', () => {
  if (isPanning) {
    isPanning = false;
    canvasViewport.classList.remove('dragging');
  }
});
// --- End Camera System ---

function generateUniqueVibrantColor() {
  // Math.random ensures 360 * 30 * 20 = 216,000 strictly unique color combination strings.
  const hue = Math.floor(Math.random() * 360);
  const sat = 70 + Math.floor(Math.random() * 30);   // 70% to 100% saturation
  const light = 35 + Math.floor(Math.random() * 20); // 35% to 55% lightness (deep but vibrant)
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function getPersistentRandomColor(uid) {
  const savedKey = `canvas_color_${uid}`;
  const savedColor = localStorage.getItem(savedKey);
  
  if (savedColor) {
    return savedColor;
  }
  
  const newColor = generateUniqueVibrantColor();
  localStorage.setItem(savedKey, newColor);
  return newColor;
}

// Handle login
googleSignInBtn.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch(error) {
    console.error("Auth error", error);
    alert("Could not sign in with Google.");
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    userName = user.displayName || "Anonymous";
    userId = user.uid;
    userColor = getPersistentRandomColor(user.uid);
    loginOverlay.classList.add("hidden");
    input.focus();
    updateCameraTransform();
    
    // Admin check
    if (user.email === "charleswang1068@gmail.com") {
      adminClearBtn.classList.remove("hidden");
    } else {
      adminClearBtn.classList.add("hidden");
    }
    
    // Re-evaluate dragging for messages already loaded
    Object.keys(messageElements).forEach(key => {
       const el = messageElements[key];
       const dataUserId = el.dataset.uid;
       if (dataUserId === userId) {
         el.classList.add("draggable");
         makeDraggable(el, key);
       }
    });
  } else {
    loginOverlay.classList.remove("hidden");
  }
});

let currentMouseX = null;
let currentMouseY = null;

const hitMarker = document.createElement('div');
hitMarker.className = 'hit-marker hidden';
document.body.appendChild(hitMarker);

window.addEventListener('mousemove', (e) => {
  currentMouseX = e.clientX;
  currentMouseY = e.clientY;
  
  // Hide if hovering over input interface, overlay, or header
  if (e.target.closest('.input-container') || e.target.closest('.header') || e.target.closest('.overlay') || e.target.closest('.admin-btn')) {
    hitMarker.classList.add('hidden');
  } else {
    hitMarker.classList.remove('hidden');
    hitMarker.style.left = `${currentMouseX}px`;
    hitMarker.style.top = `${currentMouseY}px`;
  }
});

document.addEventListener('mouseleave', () => {
  currentMouseX = null;
  currentMouseY = null;
  hitMarker.classList.add('hidden');
});

document.addEventListener('mouseenter', (e) => {
  currentMouseX = e.clientX;
  currentMouseY = e.clientY;
});

// Helper to get spawn position (mouse position or center fallback)
function getSpawnPosition() {
  let cx = window.innerWidth / 2;
  let cy = window.innerHeight / 2;
  
  if (currentMouseX !== null && currentMouseY !== null) {
    cx = currentMouseX;
    cy = currentMouseY;
  }
  
  const worldX = (cx - camera.x) / camera.z;
  const worldY = (cy - camera.y) / camera.z;
  
  return { x: worldX, y: worldY };
}

async function submitMessage(rawText, pos, isClone = false) {
  try {
    await push(messagesRef, {
      text: rawText,
      sender: userName,
      color: userColor,
      userId: userId,
      x: pos.x,
      y: pos.y,
      timestamp: Date.now()
    });
    
    const lowerText = rawText.toLowerCase();
    let firstTrigger = null;
    let firstTriggerIndex = Infinity;
    const triggerKeywords = ["cast", "boom", "smoke"];
    for (const keyword of triggerKeywords) {
      const idx = lowerText.indexOf(keyword);
      if (idx !== -1 && idx < firstTriggerIndex) {
        firstTriggerIndex = idx;
        firstTrigger = keyword;
      }
    }
    
    // Feature: Cast
    if (firstTrigger === "cast") {
      let dir = "right"; // default direction
      const directions = ["up", "down", "left", "right"];
      const words = rawText.toLowerCase().match(/\b\w+\b/g) || [];
      for (const w of words) {
        if (directions.includes(w)) {
          dir = w;
          break; // pick the first directional word
        }
      }

      let spawnX = pos.x;
      let spawnY = pos.y;
      if (dir === "right") spawnX += 100;
      else if (dir === "left") spawnX -= 100;
      else if (dir === "up") spawnY -= 100;
      else if (dir === "down") spawnY += 100;

      const bulletRef = await push(messagesRef, {
        text: "x",
        isBullet: true,
        sender: userName,
        color: userColor,
        userId: userId,
        x: spawnX,
        y: spawnY,
        timestamp: Date.now()
      });
      startBulletLoop(bulletRef.key, dir);
    }
    

  } catch (error) {
    console.error("Error writing to Firebase:", error);
  }
}

// Handle sending messages
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const rawText = input.value.trim();
  if (!rawText || isSubmitting) return;

  isSubmitting = true;
  const pos = getSpawnPosition();
  
  await submitMessage(rawText, pos, false);
  
  input.value = "";
  isSubmitting = false;
});

// Admin Clear Logic
adminClearBtn.addEventListener("click", () => {
  if (confirm("Are you sure you want to clear the entire canvas? This cannot be undone.")) {
    remove(messagesRef).catch(err => console.error("Error clearing board", err));
  }
});

// DB Listeners
onChildAdded(messagesRef, (snapshot) => {
  createMessageElement(snapshot.key, snapshot.val());
});

onChildRemoved(messagesRef, (snapshot) => {
  const key = snapshot.key;
  if (messageElements[key]) {
    const el = messageElements[key];
    if (document.body.contains(el)) {
      const cx = parseFloat(el.style.left) || 0;
      const cy = parseFloat(el.style.top) || 0;
      createAshes(cx, cy);
    }
    
    el.style.transition = 'transform 0.2s ease-in, opacity 0.2s ease-in, filter 0.2s ease-in';
    el.style.transform = 'scale(0.5)';
    el.style.opacity = '0';
    el.style.filter = 'brightness(0.2) grayscale(100%)';
    
    const uiContainer = document.getElementById(`smoke-ui-${key}`);
    if (uiContainer) uiContainer.remove();
    
    setTimeout(() => {
      el.remove();
    }, 200);
    delete messageElements[key];
  }
});

onChildChanged(messagesRef, (snapshot) => {
  const data = snapshot.val();
  const key = snapshot.key;
  
  if (messageElements[key]) {
    const el = messageElements[key];
    if (!el.dataset.isDragging) {
      el.classList.add("not-dragging");
      el.style.left = `${data.x}px`;
      el.style.top = `${data.y}px`;
    }
    updateSmokeAccess(el, key, data);
  }
});

function createMessageElement(key, data) {
  const messageElement = document.createElement("div");
  messageElement.classList.add("canvas-message");
  messageElement.id = `msg-${key}`;
  
  messageElement.style.left = `${data.x || 0}px`;
  messageElement.style.top = `${data.y || 0}px`;
  messageElement.style.backgroundColor = data.color || "#111";

  const senderElement = document.createElement("div");
  senderElement.classList.add("message-sender");
  senderElement.textContent = data.sender || "Anonymous";
  
  const textElement = document.createElement("div");
  textElement.classList.add("message-text");
  textElement.textContent = data.text;
  
  messageElement.appendChild(senderElement);
  messageElement.appendChild(textElement);
  
  messageElement.dataset.uid = data.userId;
  if (data.isBullet) {
    messageElement.dataset.isBullet = "true";
    messageElement.classList.add("bullet-bubble");
  }
  messageElements[key] = messageElement;

  if (userId && data.userId === userId) {
    messageElement.classList.add("draggable");
    makeDraggable(messageElement, key);
  }

  canvasContainer.appendChild(messageElement);

  const isRecent = Date.now() - (data.timestamp || 0) < 10000;
  if (!isRecent) {
    messageElement.style.animation = 'none'; // Disable popIn animation for old messages
  }

  const lowerText = (data.text || "").toLowerCase();
  let firstTrigger = null;
  let firstTriggerIndex = Infinity;
  const triggerKeywords = ["cast", "boom", "smoke"];
  for (const keyword of triggerKeywords) {
    const idx = lowerText.indexOf(keyword);
    if (idx !== -1 && idx < firstTriggerIndex) {
      firstTriggerIndex = idx;
      firstTrigger = keyword;
    }
  }

  if (firstTrigger === 'smoke') {
    const smokeEl = document.createElement("div");
    smokeEl.className = "smoke-cloud";
    const bubbleColor = data.color || '#bac1cc';
    smokeEl.style.backgroundColor = `color-mix(in srgb, ${bubbleColor} 30%, #d1d6e0)`;
    
    if (userId && data.userId === userId) {
      smokeEl.classList.add("own-smoke");
      smokeEl.style.backgroundColor = `color-mix(in srgb, ${bubbleColor} 10%, transparent)`;
      smokeEl.style.borderColor = `color-mix(in srgb, ${bubbleColor} 40%, rgba(200, 200, 200, 0.6))`;
    }
    // Boost zIndex so smoke covers other bubbles
    messageElement.style.zIndex = 900;
    messageElement.appendChild(smokeEl);
  }

  updateSmokeAccess(messageElement, key, data);

  if (isRecent && firstTrigger === 'boom') {
    setTimeout(() => {
      if (document.body.contains(messageElement)) {
        messageElement.classList.add('shake-animation');
        const cx = parseFloat(messageElement.style.left) || 0;
        const cy = parseFloat(messageElement.style.top) || 0;
        createExplosion(cx, cy);
        
        // Destruction logic in world coordinates
        if (userId && data.userId === userId) {
          const myX = parseFloat(messageElement.style.left) || 0;
          const myY = parseFloat(messageElement.style.top) || 0;
          const explosionRadius = 350; // Radius in canvas pixels
          
          Object.entries(messageElements).forEach(([otherKey, otherElement]) => {
            if (otherKey !== key) {
              const otherUid = otherElement.dataset.uid;
              if (otherUid !== userId) {
                remove(ref(db, `canvas_messages/${otherKey}`)).catch(err => console.error("Error destroying message", err));
              }
            }
          });
        }

        setTimeout(() => {
          messageElement.classList.remove('shake-animation');
          messageElement.style.animation = 'none';
        }, 500);
      }
    }, 400); // 400ms corresponds to the popIn animation length
  }
}

// Global zIndex counter for stacking
let globalZIndex = 10;

function makeDraggable(el, dbKey) {
  let isDragging = false;
  let startMouseX = 0, startMouseY = 0;
  let startElX = 0, startElY = 0;

  el.addEventListener('mousedown', dragStart);
  el.addEventListener('touchstart', dragStart, { passive: false });

  function dragStart(e) {
    if (e.type === 'mousedown' && e.button !== 0) return;
    
    e.preventDefault();
    // Stop event propagating to viewport so it doesn't pan canvas at the same time
    e.stopPropagation();

    isDragging = true;
    el.dataset.isDragging = "true";
    el.classList.remove("not-dragging");
    
    globalZIndex++;
    el.style.zIndex = globalZIndex;

    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

    startMouseX = clientX;
    startMouseY = clientY;
    
    startElX = parseFloat(el.style.left) || 0;
    startElY = parseFloat(el.style.top) || 0;

    document.addEventListener('mousemove', drag);
    document.addEventListener('touchmove', drag, { passive: false });
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('touchend', dragEnd);
  }

  function drag(e) {
    if (!isDragging) return;
    e.preventDefault();

    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

    // Must divide mouse delta by current camera scale to get correct world delta
    const deltaX = (clientX - startMouseX) / camera.z;
    const deltaY = (clientY - startMouseY) / camera.z;
    
    const newX = startElX + deltaX;
    const newY = startElY + deltaY;

    el.style.left = `${newX}px`;
    el.style.top = `${newY}px`;
    
    const uiContainer = document.getElementById(`smoke-ui-${dbKey}`);
    if (uiContainer) {
      uiContainer.style.left = `${newX}px`;
      uiContainer.style.top = `calc(${newY}px + 50px)`;
    }
  }

  function dragEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    delete el.dataset.isDragging;

    document.removeEventListener('mousemove', drag);
    document.removeEventListener('touchmove', drag);
    document.removeEventListener('mouseup', dragEnd);
    document.removeEventListener('touchend', dragEnd);

    const finalX = parseFloat(el.style.left);
    const finalY = parseFloat(el.style.top);

    update(ref(db, `canvas_messages/${dbKey}`), {
      x: finalX,
      y: finalY
    }).catch(err => console.error(err));
  }
}

function createExplosion(x, y) {
  // Main fireball blast core
  const blast = document.createElement('div');
  blast.className = 'explosion-blast';
  blast.style.left = `${x}px`;
  blast.style.top = `${y}px`;
  canvasContainer.appendChild(blast);
  blast.animate([
    { transform: 'translate(-50%, -50%) scale(0.05)', opacity: 1, filter: 'saturate(2) brightness(2)' },
    { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95, filter: 'saturate(1.2) brightness(1)', offset: 0.2 },
    { transform: 'translate(-50%, -50%) scale(1.15)', opacity: 0, filter: 'saturate(0) brightness(0.2)', offset: 1 }
  ], { duration: 900, easing: 'cubic-bezier(0.1, 0.9, 0.2, 1)' }).onfinish = () => blast.remove();

  const colors = ['#ff0000', '#ff7f00', '#ffff00', '#333333', '#ffffff', '#ff4500'];
  for (let i = 0; i < 40; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    const size = Math.random() * 8 + 4;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    particle.style.left = `${x - size/2}px`;
    particle.style.top = `${y - size/2}px`;
    
    canvasContainer.appendChild(particle);
    
    const angle = Math.random() * Math.PI * 2;
    const velocity = Math.random() * 150 + 50;
    const tx = Math.cos(angle) * velocity;
    const ty = Math.sin(angle) * velocity + 100; // gravity effect
    
    particle.animate([
      { transform: `translate(0px, 0px) scale(1)`, opacity: 1 },
      { transform: `translate(${tx}px, ${ty}px) scale(0)`, opacity: 0 }
    ], {
      duration: 800 + Math.random() * 400,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)'
    }).onfinish = () => particle.remove();
  }
}

function createAshes(x, y) {
  const ashColors = ['#333', '#555', '#777', '#222', '#111'];
  for (let i = 0; i < 30; i++) {
    const ash = document.createElement('div');
    ash.className = 'ash';
    const size = Math.random() * 5 + 3;
    ash.style.width = `${size}px`;
    ash.style.height = `${size}px`;
    ash.style.backgroundColor = ashColors[Math.floor(Math.random() * ashColors.length)];
    ash.style.left = `${x}px`;
    ash.style.top = `${y}px`;
    
    canvasContainer.appendChild(ash);
    
    const angle = Math.random() * Math.PI * 2;
    const velocity = Math.random() * 80 + 30;
    const tx = Math.cos(angle) * velocity;
    const ty = Math.sin(angle) * velocity + 40; // falling effect
    const rot = Math.random() * 360;
    
    ash.animate([
      { transform: `translate(-50%, -50%) rotate(0deg) scale(1)`, opacity: 0.9 },
      { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) rotate(${rot}deg) scale(0)`, opacity: 0 }
    ], {
      duration: 600 + Math.random() * 400,
      easing: 'ease-out'
    }).onfinish = () => ash.remove();
  }
}

function startBulletLoop(key, dir = "right") {
  const speed = 15; // pixels per frame

  const interval = setInterval(() => {
    const el = messageElements[key];
    if (!el || !document.body.contains(el)) {
      clearInterval(interval);
      return;
    }

    const currentX = parseFloat(el.style.left) || 0;
    const currentY = parseFloat(el.style.top) || 0;
    
    let newX = currentX;
    let newY = currentY;
    
    if (dir === "right") newX += speed;
    else if (dir === "left") newX -= speed;
    else if (dir === "up") newY -= speed;
    else if (dir === "down") newY += speed;
    
    // Locally update position for smooth animation
    el.style.left = `${newX}px`;
    el.style.top = `${newY}px`;

    // Sync to Firebase occasionally so others see it moving
    update(ref(db, `canvas_messages/${key}`), { x: newX, y: newY }).catch(() => {});

    // Collision Detection
    const rect1 = el.getBoundingClientRect();
    const myUid = el.dataset.uid;

    for (const [otherKey, otherElement] of Object.entries(messageElements)) {
      if (otherElement !== el) {
        const otherUid = otherElement.dataset.uid;
        if (otherUid !== myUid) {
          const rect2 = otherElement.getBoundingClientRect();
          if (!(rect1.right < rect2.left || 
                rect1.left > rect2.right || 
                rect1.bottom < rect2.top || 
                rect1.top > rect2.bottom)) {
            // Collision!
            clearInterval(interval);
            remove(ref(db, `canvas_messages/${otherKey}`)).catch(console.error);
            remove(ref(db, `canvas_messages/${key}`)).catch(console.error);
            break;
          }
        }
      }
    }
  }, 30);
}

function updateSmokeAccess(el, key, data) {
  const lowerText = (data.text || "").toLowerCase();
  let firstTrigger = null;
  let firstTriggerIndex = Infinity;
  const triggerKeywords = ["cast", "boom", "smoke"];
  for (const keyword of triggerKeywords) {
    const idx = lowerText.indexOf(keyword);
    if (idx !== -1 && idx < firstTriggerIndex) {
      firstTriggerIndex = idx;
      firstTrigger = keyword;
    }
  }

  if (firstTrigger !== 'smoke') return;

  const smokeEl = el.querySelector('.smoke-cloud');
  if (!smokeEl) return;

  const requests = data.accessRequests || {};
  
  let uiContainer = document.getElementById(`smoke-ui-${key}`);
  if (!uiContainer) {
    uiContainer = document.createElement('div');
    uiContainer.id = `smoke-ui-${key}`;
    uiContainer.className = 'smoke-requests-ui';
    uiContainer.style.position = 'absolute';
    uiContainer.style.zIndex = 99999;
    uiContainer.style.transform = 'translate(-50%, 0)';
    uiContainer.addEventListener('mousedown', e => e.stopPropagation());
    uiContainer.addEventListener('touchstart', e => e.stopPropagation());
    canvasContainer.appendChild(uiContainer);
  }
  
  uiContainer.style.left = `${data.x || 0}px`;
  uiContainer.style.top = `calc(${data.y || 0}px + 50px)`;
  
  if (userId && data.userId === userId) {
    uiContainer.innerHTML = '';
    let hasPending = false;
    for (const [reqId, reqData] of Object.entries(requests)) {
      if (reqData.status === 'pending') {
        hasPending = true;
        const reqRow = document.createElement('div');
        reqRow.className = 'smoke-req-row';
        reqRow.innerHTML = `
          <span><b>${reqData.name}</b> requests access</span>
          <div>
            <button class="smoke-btn accept-btn">Accept</button>
            <button class="smoke-btn deny-btn">Deny</button>
          </div>
        `;
        reqRow.querySelector('.accept-btn').addEventListener('click', () => {
          update(ref(db, `canvas_messages/${key}/accessRequests/${reqId}`), { status: 'granted', name: reqData.name }).catch(err => console.error(err));
        });
        reqRow.querySelector('.deny-btn').addEventListener('click', () => {
          update(ref(db, `canvas_messages/${key}/accessRequests/${reqId}`), { status: 'denied', name: reqData.name }).catch(err => console.error(err));
        });
        uiContainer.appendChild(reqRow);
      }
    }
    uiContainer.style.display = hasPending ? 'block' : 'none';
  } else if (userId) {
    const myRequest = requests[userId];
    const bubbleColor = data.color || '#bac1cc';
    
    if (myRequest && myRequest.status === 'granted') {
      uiContainer.style.display = 'none';
      smokeEl.classList.add("own-smoke");
      smokeEl.style.backgroundColor = `color-mix(in srgb, ${bubbleColor} 10%, transparent)`;
      smokeEl.style.borderColor = `color-mix(in srgb, ${bubbleColor} 40%, rgba(200, 200, 200, 0.6))`;
    } else {
      smokeEl.classList.remove("own-smoke");
      smokeEl.style.backgroundColor = `color-mix(in srgb, ${bubbleColor} 30%, #d1d6e0)`;
      
      uiContainer.style.display = 'block';
      if (myRequest && myRequest.status === 'pending') {
        uiContainer.innerHTML = `<div class="smoke-req-status">Request Pending...</div>`;
      } else if (myRequest && myRequest.status === 'denied') {
        uiContainer.innerHTML = `<div class="smoke-req-status denied">Access Denied</div>`;
      } else {
        uiContainer.innerHTML = `<button class="smoke-btn request-btn">Request Vision</button>`;
        uiContainer.querySelector('.request-btn').addEventListener('click', () => {
          update(ref(db, `canvas_messages/${key}/accessRequests/${userId}`), {
            name: userName,
            status: 'pending'
          }).catch(err => console.error(err));
        });
      }
    }
  }
}
