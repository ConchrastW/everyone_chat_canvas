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

// Helper to get a random position near the center of the current exact camera view
function getCurrentViewCenterPosition() {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  
  const offsetX = (Math.random() - 0.5) * 300;
  const offsetY = (Math.random() - 0.5) * 300;
  
  const worldX = (cx - camera.x) / camera.z + offsetX;
  const worldY = (cy - camera.y) / camera.z + offsetY;
  
  return { x: worldX, y: worldY };
}

// Handle sending messages
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const text = input.value.trim();
  if (!text || isSubmitting) return;

  isSubmitting = true;
  
  const pos = getCurrentViewCenterPosition();

  try {
    await push(messagesRef, {
      text: text,
      sender: userName,
      color: userColor,
      userId: userId,
      x: pos.x,
      y: pos.y,
      timestamp: Date.now()
    });
    input.value = "";
  } catch (error) {
    console.error("Error writing to Firebase:", error);
  } finally {
    isSubmitting = false;
  }
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
    messageElements[key].remove();
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
  messageElements[key] = messageElement;

  if (userId && data.userId === userId) {
    messageElement.classList.add("draggable");
    makeDraggable(messageElement, key);
  }

  canvasContainer.appendChild(messageElement);

  const lowerText = (data.text || "").toLowerCase();
  if (lowerText.includes('bomb') || lowerText.includes('explode') || lowerText.includes('boom')) {
    setTimeout(() => {
      if (document.body.contains(messageElement)) {
        messageElement.classList.add('shake-animation');
        const rect = messageElement.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        createExplosion(cx, cy);
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

    el.style.left = `${startElX + deltaX}px`;
    el.style.top = `${startElY + deltaY}px`;
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
    
    document.body.appendChild(particle);
    
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
