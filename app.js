import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getDatabase, ref, push, update, remove, onChildAdded, onChildChanged, onChildRemoved } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

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
const storage = getStorage(app);
const provider = new GoogleAuthProvider();
const messagesRef = ref(db, "canvas_messages");

// No fixed color palettes anymore, colors are infinitely generated.

// DOM Elements
const loginOverlay = document.getElementById("login-overlay");
const customizeOverlay = document.getElementById("customize-overlay");
const colorFillInput = document.getElementById("color-fill");
const colorOutlineInput = document.getElementById("color-outline");
const colorTextInput = document.getElementById("color-text");
const bubblePreview = document.getElementById("bubble-preview");
const previewSender = document.getElementById("preview-sender");
const joinCanvasBtn = document.getElementById("join-canvas-btn");
const googleSignInBtn = document.getElementById("google-signin-btn");
const form = document.getElementById("message-form");
const input = document.getElementById("message-input");
const imageInput = document.getElementById("image-input");
const attachBtnLabel = document.getElementById("attach-btn-label");
const canvasViewport = document.getElementById("canvas-viewport");
const canvasContainer = document.getElementById("canvas-container");
const userBadge = document.getElementById("user-badge");
const userBadgeBubble = document.getElementById("user-badge-bubble");
const userBadgeName = document.getElementById("user-badge-name");

// State
let isSubmitting = false;
let userName = "Anonymous";
let userColor = "#4285F4";
let userTextColor = "#ffffff";
let userOutlineColor = "transparent";
let userId = null;
const pageLoadTime = Date.now();
const messageElements = {};
const globalHistory = [];

// --- Camera System (Infinite Canvas) ---
let camera = { x: 0, y: 0, z: 1 };

function updateCameraTransform() {
  canvasContainer.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})`;
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

function updatePreview() {
  bubblePreview.style.backgroundColor = colorFillInput.value;
  bubblePreview.style.color = colorTextInput.value;
  bubblePreview.style.border = colorOutlineInput.value !== "transparent" && colorOutlineInput.value !== "#00000000" ? `3px solid ${colorOutlineInput.value}` : "none";
}

colorFillInput.addEventListener("input", updatePreview);
colorTextInput.addEventListener("input", updatePreview);
colorOutlineInput.addEventListener("input", updatePreview);

joinCanvasBtn.addEventListener("click", () => {
  userColor = colorFillInput.value;
  userTextColor = colorTextInput.value;
  userOutlineColor = colorOutlineInput.value;
  
  localStorage.setItem(`color_fill_${userId}`, userColor);
  localStorage.setItem(`color_text_${userId}`, userTextColor);
  localStorage.setItem(`color_outline_${userId}`, userOutlineColor);
  
  const updates = {};
  for (const [key, el] of Object.entries(messageElements)) {
    if (el.dataset.uid === userId) {
      updates[`${key}/color`] = userColor;
      updates[`${key}/textColor`] = userTextColor;
      updates[`${key}/outlineColor`] = userOutlineColor;
    }
  }
  if (Object.keys(updates).length > 0) {
    update(messagesRef, updates).catch(err => console.error(err));
  }
  
  customizeOverlay.classList.add("hidden");
  hitMarker.classList.remove("hidden");
  
  // Update and show user badge
  userBadgeName.textContent = userName;
  userBadgeBubble.style.backgroundColor = userColor;
  userBadgeBubble.style.color = userTextColor;
  if (userOutlineColor !== "transparent" && userOutlineColor !== "#00000000") {
    userBadgeBubble.style.border = `3px solid ${userOutlineColor}`;
  } else {
    userBadgeBubble.style.border = "none";
  }
  userBadge.classList.remove("hidden");
  
  input.focus();
  updateCameraTransform();
  
  // Re-evaluate dragging for messages already loaded
  Object.keys(messageElements).forEach(key => {
     const el = messageElements[key];
     const dataUserId = el.dataset.uid;
     if (dataUserId === userId) {
       if (!el.classList.contains("draggable")) {
         el.classList.add("draggable");
         makeDraggable(el, key);
       }
     }
  });
});

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
    
    const savedFill = localStorage.getItem(`color_fill_${userId}`);
    const savedText = localStorage.getItem(`color_text_${userId}`);
    const savedOutline = localStorage.getItem(`color_outline_${userId}`);
    
    if (savedFill) colorFillInput.value = savedFill;
    if (savedText) colorTextInput.value = savedText;
    if (savedOutline) colorOutlineInput.value = savedOutline;
    
    previewSender.textContent = userName;
    updatePreview();
    
    // Apply draggable & delete to previously loaded messages
    for (const [key, el] of Object.entries(messageElements)) {
      if (el.dataset.uid === userId) {
        if (!el.classList.contains("draggable")) {
          el.classList.add("draggable");
          makeDraggable(el, key);
        }
        addDeleteButton(el, key);
      }
    }

    loginOverlay.classList.add("hidden");
    customizeOverlay.classList.remove("hidden");
    hitMarker.classList.add("hidden");
  } else {
    loginOverlay.classList.remove("hidden");
    customizeOverlay.classList.add("hidden");
    hitMarker.classList.add("hidden");
  }
});

let currentMouseX = null;
let currentMouseY = null;

const hitMarker = document.createElement('div');
hitMarker.className = 'hit-marker hidden';
document.body.appendChild(hitMarker);

// Keep tracking mouse for other potential uses, but don't move the hitMarker
window.addEventListener('mousemove', (e) => {
  currentMouseX = e.clientX;
  currentMouseY = e.clientY;
});

// Helper to get spawn position (always center of the screen)
function getSpawnPosition() {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  
  const worldX = (cx - camera.x) / camera.z;
  const worldY = (cy - camera.y) / camera.z;
  
  return { x: worldX, y: worldY };
}

async function submitMessage(rawText, pos, isClone = false, imageUrl = null) {
  try {
    const lowerText = (rawText || "").toLowerCase();
    let firstTrigger = null;
    let firstTriggerIndex = Infinity;
    const triggerKeywords = ["send", "boom", "smoke", "physics"];
    for (const keyword of triggerKeywords) {
      const idx = lowerText.indexOf(keyword);
      if (idx !== -1 && idx < firstTriggerIndex) {
        firstTriggerIndex = idx;
        firstTrigger = keyword;
      }
    }

    const messageData = {
      text: rawText || "",
      imageUrl: imageUrl,
      sender: userName,
      color: userColor,
      textColor: userTextColor,
      outlineColor: userOutlineColor,
      userId: userId,
      x: pos.x,
      y: pos.y,
      timestamp: Date.now()
    };

    if (firstTrigger === "send") {
      let angle = 0;
      const angleMatch = rawText.match(/(-?\d+(?:\.\d+)?)\s*degrees?/i);
      if (angleMatch) {
        angle = parseFloat(angleMatch[1]);
      }
      messageData.sendAngle = angle;
    }

    const mainMsgRef = await push(messagesRef, messageData);
    const mainKey = mainMsgRef.key;

    if (firstTrigger === "physics") {
      startPhysicsLoop(mainKey);
    }
    

  } catch (error) {
    console.error("Error writing to Firebase:", error);
  }
}

// Handle sending messages
imageInput.addEventListener("change", () => {
  if (imageInput.files.length > 0) attachBtnLabel.style.color = "#4285F4";
  else attachBtnLabel.style.color = "#888";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const rawText = input.value.trim();
  const hasFile = imageInput.files.length > 0;
  
  if ((!rawText && !hasFile) || isSubmitting) return;

  if (rawText.toLowerCase() === "clear") {
    const updates = {};
    for (const [key, el] of Object.entries(messageElements)) {
      if (el.dataset.uid === userId) {
        updates[key] = null;
      }
    }
    if (Object.keys(updates).length > 0) {
      update(messagesRef, updates).catch(err => console.error("Error clearing messages:", err));
    }
    
    push(ref(db, 'canvas_broadcasts'), {
      text: `${userName} wiped all their messages from the board!`,
      timestamp: Date.now()
    }).catch(() => {});
    
    input.value = "";
    return;
  }

  isSubmitting = true;
  const pos = getSpawnPosition();
  
  let imageUrl = null;
  if (hasFile) {
    const file = imageInput.files[0];
    
    if (file.size > 5 * 1024 * 1024) {
      alert("Image is too large! Please choose a file under 5MB.");
      isSubmitting = false;
      return;
    }

    try {
      imageUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
      });
    } catch (err) {
      console.error("File read error", err);
      alert("Failed to read image.");
      isSubmitting = false;
      return;
    }
  }
  
  await submitMessage(rawText, pos, false, imageUrl);
  
  input.value = "";
  imageInput.value = "";
  attachBtnLabel.style.color = "#888";
  isSubmitting = false;
});


// DB Listeners
onChildAdded(messagesRef, (snapshot) => {
  const data = snapshot.val();
  const key = snapshot.key;
  createMessageElement(key, data);
  
  if (!data.isBullet) {
    const text = computeBroadcastText(key, data);
    if (text) {
      appendToHistory(text, data.timestamp || Date.now(), false);
      if (data.timestamp && data.timestamp > pageLoadTime) {
        addBroadcastElement(text);
      }
    }
  }
});

onChildAdded(ref(db, 'canvas_broadcasts'), (snapshot) => {
  const data = snapshot.val();
  appendToHistory(data.text, data.timestamp || Date.now(), true);
  if (data.timestamp && data.timestamp > pageLoadTime) {
    addBroadcastElement(data.text);
  }
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
    
    el.style.backgroundColor = data.color || "#111";
    if (data.textColor) {
      el.style.color = data.textColor;
    }
    if (data.outlineColor && data.outlineColor !== "transparent" && data.outlineColor !== "#00000000") {
      el.style.border = `3px solid ${data.outlineColor}`;
    } else {
      el.style.border = "none";
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
  
  if (data.textColor) {
    messageElement.style.color = data.textColor;
  }
  if (data.outlineColor && data.outlineColor !== "transparent" && data.outlineColor !== "#00000000") {
    messageElement.style.border = `3px solid ${data.outlineColor}`;
  }

  const senderElement = document.createElement("div");
  senderElement.classList.add("message-sender");
  senderElement.textContent = data.sender || "Anonymous";
  
  const textElement = document.createElement("div");
  textElement.classList.add("message-text");
  textElement.textContent = data.text;
  
  messageElement.appendChild(senderElement);
  if (data.text) {
    messageElement.appendChild(textElement);
  }
  if (data.imageUrl) {
    const imgEl = document.createElement("img");
    imgEl.src = data.imageUrl;
    imgEl.className = "attached-image-preview";
    messageElement.appendChild(imgEl);
  }
  
  messageElement.dataset.uid = data.userId;
  if (data.parentId) {
    messageElement.dataset.parentId = data.parentId;
  }
  if (data.isBullet) {
    messageElement.dataset.isBullet = "true";
    messageElement.classList.add("bullet-bubble");
  }
  if (data.sendAngle !== undefined) {
    messageElement.dataset.sendAngle = data.sendAngle;
  }
  messageElements[key] = messageElement;

  if (userId && data.userId === userId) {
    messageElement.classList.add("draggable");
    makeDraggable(messageElement, key);
    addDeleteButton(messageElement, key);
  }

  canvasContainer.appendChild(messageElement);

  const isRecent = Date.now() - (data.timestamp || 0) < 10000;
  if (!isRecent) {
    messageElement.style.animation = 'none'; // Disable popIn animation for old messages
  }

  const lowerText = (data.text || "").toLowerCase();
  let firstTrigger = null;
  let firstTriggerIndex = Infinity;
  const triggerKeywords = ["send", "boom", "smoke"];
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
        
        // Push logic in world coordinates
        if (userId && data.userId === userId) {
          const myX = parseFloat(messageElement.style.left) || 0;
          const myY = parseFloat(messageElement.style.top) || 0;
          
          // The visual core of the fireball is smaller than the 525px bounding box.
          // The radial gradient fades to dark grey at 85% and transparent at 100%.
          // We use 75% of the base radius to match the intense fire part.
          const explosionRadius = (525 / 2) * 0.75; 
          
          Object.entries(messageElements).forEach(([otherKey, otherElement]) => {
            if (otherKey !== key) {
              const otherX = parseFloat(otherElement.style.left) || 0;
              const otherY = parseFloat(otherElement.style.top) || 0;
              
              // Speech bubbles are centered on otherX, otherY via translate(-50%, -50%)
              const width = otherElement.offsetWidth;
              const height = otherElement.offsetHeight;
              const left = otherX - width / 2;
              const right = otherX + width / 2;
              const top = otherY - height / 2;
              const bottom = otherY + height / 2;

              // Find the closest point on the rectangle to the explosion center
              const closestX = Math.max(left, Math.min(myX, right));
              const closestY = Math.max(top, Math.min(myY, bottom));

              const distSquared = Math.pow(myX - closestX, 2) + Math.pow(myY - closestY, 2);
              
              if (distSquared <= (explosionRadius * explosionRadius)) {
                // Calculate push vector from center of explosion to center of other element
                let dx = otherX - myX;
                let dy = otherY - myY;
                
                // If they are exactly on top of each other, give a random nudge
                if (dx === 0 && dy === 0) {
                  dx = (Math.random() - 0.5) * 10;
                  dy = (Math.random() - 0.5) * 10;
                }
                
                const length = Math.sqrt(dx * dx + dy * dy);
                const nx = dx / length;
                const ny = dy / length;
                
                // Base push amount: push it clear of the explosion radius
                const desiredDistance = explosionRadius + Math.max(width, height) / 2 + 50;
                let pushAmount = 0;
                if (length < desiredDistance) {
                  pushAmount = desiredDistance - length;
                }
                
                // Add an extra pop outwards
                pushAmount += 150;
                
                const newX = otherX + nx * pushAmount;
                const newY = otherY + ny * pushAmount;

                update(ref(db, `canvas_messages/${otherKey}`), { x: newX, y: newY }).catch(err => console.error("Error pushing message", err));
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

function addDeleteButton(el, key) {
  if (el.querySelector('.delete-btn')) return;
  const deleteBtn = document.createElement("button");
  deleteBtn.classList.add("delete-btn");
  deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  deleteBtn.addEventListener("click", () => {
    if (confirm("Delete this message?")) {
      remove(ref(db, `canvas_messages/${key}`)).catch(err => console.error(err));
    }
  });
  el.appendChild(deleteBtn);
}

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

    const myWidth = el.offsetWidth || 150;
    const myHeight = el.offsetHeight || 50;
    const myLeft = newX - myWidth / 2;
    const myRight = newX + myWidth / 2;
    const myTop = newY - myHeight / 2;
    const myBottom = newY + myHeight / 2;

    for (const [otherKey, otherElement] of Object.entries(messageElements)) {
      if (otherElement !== el && otherElement.dataset.sendAngle !== undefined) {
        const otherX = parseFloat(otherElement.style.left) || 0;
        const otherY = parseFloat(otherElement.style.top) || 0;
        const width = otherElement.offsetWidth || 150;
        const height = otherElement.offsetHeight || 50;
        
        const otherLeft = otherX - width / 2;
        const otherRight = otherX + width / 2;
        const otherTop = otherY - height / 2;
        const otherBottom = otherY + height / 2;

        if (!(myRight < otherLeft || myLeft > otherRight || myBottom < otherTop || myTop > otherBottom)) {
           otherElement.classList.add('send-hover-ready');
        } else {
           otherElement.classList.remove('send-hover-ready');
        }
      }
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

    let fired = false;
    for (const [otherKey, otherElement] of Object.entries(messageElements)) {
      if (otherElement.dataset.sendAngle !== undefined) {
        otherElement.classList.remove('send-hover-ready');
      }
      if (otherElement !== el && otherElement.dataset.sendAngle !== undefined) {
        const otherX = parseFloat(otherElement.style.left) || 0;
        const otherY = parseFloat(otherElement.style.top) || 0;
        const width = otherElement.offsetWidth || 150;
        const height = otherElement.offsetHeight || 50;
        
        const otherLeft = otherX - width / 2;
        const otherRight = otherX + width / 2;
        const otherTop = otherY - height / 2;
        const otherBottom = otherY + height / 2;

        const myWidth = el.offsetWidth || 150;
        const myHeight = el.offsetHeight || 50;
        const myLeft = finalX - myWidth / 2;
        const myRight = finalX + myWidth / 2;
        const myTop = finalY - myHeight / 2;
        const myBottom = finalY + myHeight / 2;

        if (!(myRight < otherLeft || myLeft > otherRight || myBottom < otherTop || myTop > otherBottom)) {
           // Dropped onto a send bubble!
           const angle = parseFloat(otherElement.dataset.sendAngle) || 0;
           startBulletLoop(dbKey, angle, otherKey);
           fired = true;
           
           // Give the send bubble a little shake to indicate it fired
           otherElement.classList.remove('send-hover-ready');
           otherElement.classList.add('shake-animation');
           setTimeout(() => {
             if (otherElement) otherElement.classList.remove('shake-animation');
           }, 500);
           
           let inSmoke = false;
           for (const [sKey, sEl] of Object.entries(messageElements)) {
             if (sEl.querySelector('.smoke-cloud')) {
               const sx = parseFloat(sEl.style.left) || 0;
               const sy = parseFloat(sEl.style.top) || 0;
               const dx = parseFloat(otherElement.style.left) - sx;
               const dy = parseFloat(otherElement.style.top) - sy;
               if (Math.hypot(dx, dy) < 200) { inSmoke = true; break; }
             }
           }
           if (!inSmoke) {
             push(ref(db, 'canvas_broadcasts'), {
               text: `${userName} just fired off a message at ${angle} degrees!`,
               timestamp: Date.now()
             }).catch(() => {});
           }
           
           break;
        }
      }
    }

    if (!fired) {
      update(ref(db, `canvas_messages/${dbKey}`), {
        x: finalX,
        y: finalY
      }).catch(err => console.error(err));
    }
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

function startBulletLoop(key, angle = 0, launcherKey = null) {
  let vx = Math.cos(angle * Math.PI / 180) * 25; // constant velocity
  let vy = -Math.sin(angle * Math.PI / 180) * 25;
  
  let elapsed = 0;
  const maxLifetime = 5000; // 5 seconds of flight to prevent infinite Firebase writes

  const interval = setInterval(() => {
    const el = messageElements[key];
    if (!el || !document.body.contains(el)) {
      clearInterval(interval);
      return;
    }

    // Time-based cleanup instead of friction-based
    elapsed += 30;
    if (elapsed >= maxLifetime) {
      clearInterval(interval);
      setTimeout(() => {
        remove(ref(db, `canvas_messages/${key}`)).catch(() => {});
      }, 100);
      return;
    }

    const currentX = parseFloat(el.style.left) || 0;
    const currentY = parseFloat(el.style.top) || 0;
    
    let newX = currentX + vx;
    let newY = currentY + vy;
    
    // Check collisions to stop the bullet if it hits another message
    const myWidth = (el.offsetWidth || 150) * 0.8;
    const myHeight = (el.offsetHeight || 50) * 0.8;
    const myLeft = newX - myWidth / 2;
    const myRight = newX + myWidth / 2;
    const myTop = newY - myHeight / 2;
    const myBottom = newY + myHeight / 2;

    let hit = false;
    for (const [otherKey, otherElement] of Object.entries(messageElements)) {
      if (otherElement !== el && otherKey !== launcherKey) {
        const otherX = parseFloat(otherElement.style.left) || 0;
        const otherY = parseFloat(otherElement.style.top) || 0;
        
        const width = (otherElement.offsetWidth || 150) * 0.8;
        const height = (otherElement.offsetHeight || 50) * 0.8;
        
        const otherLeft = otherX - width / 2;
        const otherRight = otherX + width / 2;
        const otherTop = otherY - height / 2;
        const otherBottom = otherY + height / 2;

        if (!(myRight < otherLeft || myLeft > otherRight || myBottom < otherTop || myTop > otherBottom)) {
            hit = true;
            break;
        }
      }
    }

    if (hit) {
      clearInterval(interval);
      update(ref(db, `canvas_messages/${key}`), { x: currentX, y: currentY }).catch(() => {});
      return;
    }

    // Apply final position
    el.style.left = `${newX}px`;
    el.style.top = `${newY}px`;

    update(ref(db, `canvas_messages/${key}`), { x: newX, y: newY }).catch(() => {});
  }, 30);
}

function updateSmokeAccess(el, key, data) {
  const lowerText = (data.text || "").toLowerCase();
  let firstTrigger = null;
  let firstTriggerIndex = Infinity;
  const triggerKeywords = ["send", "boom", "smoke"];
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

function startPhysicsLoop(key) {
  let vx = (Math.random() - 0.5) * 15;
  let vy = -15; 
  const gravity = 1.2;
  const bounce = 0.5;
  const friction = 0.98;

  const interval = setInterval(() => {
    const el = messageElements[key];
    if (!el || !document.body.contains(el)) {
      clearInterval(interval);
      return;
    }

    vy += gravity;
    vx *= friction;
    vy *= friction;

    const currentX = parseFloat(el.style.left) || 0;
    const currentY = parseFloat(el.style.top) || 0;
    
    let newX = currentX + vx;
    let newY = currentY + vy;
    
    const myWidth = el.offsetWidth || 150;
    const myHeight = el.offsetHeight || 50;

    let hitSomething = false;

    for (const [otherKey, otherElement] of Object.entries(messageElements)) {
      if (otherElement !== el) {
        if (otherElement.dataset.isBullet) continue;

        const otherX = parseFloat(otherElement.style.left) || 0;
        const otherY = parseFloat(otherElement.style.top) || 0;
        const width = otherElement.offsetWidth || 150;
        const height = otherElement.offsetHeight || 50;
        
        const otherLeft = otherX - width / 2;
        const otherRight = otherX + width / 2;
        const otherTop = otherY - height / 2;
        const otherBottom = otherY + height / 2;
        
        const myLeft = newX - myWidth / 2;
        const myRight = newX + myWidth / 2;
        const myTop = newY - myHeight / 2;
        const myBottom = newY + myHeight / 2;

        if (!(myRight < otherLeft || 
              myLeft > otherRight || 
              myBottom < otherTop || 
              myTop > otherBottom)) {
          
          hitSomething = true;
          const prevRight = currentX + myWidth / 2;
          const prevLeft = currentX - myWidth / 2;
          const prevBottom = currentY + myHeight / 2;
          const prevTop = currentY - myHeight / 2;
          
          let hitX = false;
          let hitY = false;

          if (prevRight <= otherLeft || prevLeft >= otherRight) hitX = true;
          if (prevBottom <= otherTop || prevTop >= otherBottom) hitY = true;
          
          if (!hitX && !hitY) {
            const dx = newX - otherX;
            const dy = newY - otherY;
            if (Math.abs(dx) / width > Math.abs(dy) / height) hitX = true;
            else hitY = true;
          }

          if (hitX) {
            vx = -vx * bounce; 
            if (newX > otherX) newX = otherRight + myWidth / 2 + 1;
            else newX = otherLeft - myWidth / 2 - 1;
          }
          if (hitY) {
            vy = -vy * bounce; 
            if (newY > otherY) newY = otherBottom + myHeight / 2 + 1;
            else newY = otherTop - myHeight / 2 - 1;
            
            // Extra friction on the floor
            if (newY < otherY) {
              vx *= 0.8;
            }
          }
        }
      }
    }

    if (newY > 20000) {
      clearInterval(interval);
      remove(ref(db, `canvas_messages/${key}`)).catch(() => {});
      return;
    }

    // Sleep if resting
    if (hitSomething && Math.abs(vx) < 1.0 && Math.abs(vy) < 2.0) {
      clearInterval(interval);
      el.classList.remove('physics-active');
    }

    el.style.left = `${newX}px`;
    el.style.top = `${newY}px`;

    if (Math.abs(currentX - newX) > 0.5 || Math.abs(currentY - newY) > 0.5) {
       update(ref(db, `canvas_messages/${key}`), { x: newX, y: newY }).catch(() => {});
    }

  }, 30);
}

// Minecraft-style Broadcasting System
function appendToHistory(text, timestamp, isSystem = false) {
  globalHistory.push({ text, timestamp, isSystem });
  globalHistory.sort((a, b) => a.timestamp - b.timestamp);
  
  const content = document.getElementById('history-content');
  if (!content) return;
  content.innerHTML = '';
  globalHistory.forEach(item => {
    const d = new Date(item.timestamp);
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    content.innerHTML += `
      <div class="history-item ${item.isSystem ? 'system' : ''}">
        <div class="history-time">${timeStr}</div>
        <div>${item.text}</div>
      </div>
    `;
  });
  content.scrollTop = content.scrollHeight;
}

function computeBroadcastText(messageKey, data) {
  let inSmoke = false;
  for (const [key, msgEl] of Object.entries(messageElements)) {
    if (key === messageKey) continue; // Don't check against itself
    if (msgEl.querySelector('.smoke-cloud')) {
      const sx = parseFloat(msgEl.style.left) || 0;
      const sy = parseFloat(msgEl.style.top) || 0;
      const dx = data.x - sx;
      const dy = data.y - sy;
      if (Math.hypot(dx, dy) < 200) {
        inSmoke = true;
        break;
      }
    }
  }

  if (inSmoke) return null;

  const lowerText = (data.text || "").toLowerCase();
  let firstTrigger = null;
  let firstTriggerIndex = Infinity;
  const triggerKeywords = ["send", "boom", "smoke", "physics"];
  for (const keyword of triggerKeywords) {
    const idx = lowerText.indexOf(keyword);
    if (idx !== -1 && idx < firstTriggerIndex) {
      firstTriggerIndex = idx;
      firstTrigger = keyword;
    }
  }

  const name = data.sender || "Anonymous";
  let broadcastText = "";

  if (firstTrigger === "send") {
    const angleMatch = data.text.match(/(-?\d+(?:\.\d+)?)\s*degrees?/i);
    const angle = angleMatch ? angleMatch[1] : 0;
    broadcastText = `${name} casted a send spell at ${angle} degrees!`;
  } else if (firstTrigger === "boom") {
    broadcastText = `${name} caused an explosion!`;
  } else if (firstTrigger === "smoke") {
    broadcastText = `${name} deployed a smoke screen!`;
  } else if (firstTrigger === "physics") {
    broadcastText = `${name} enabled physics!`;
  } else {
    let msg = data.text;
    if (msg.length > 30) msg = msg.substring(0, 30) + "...";
    broadcastText = `${name} just typed: "${msg}" out in the open!`;
  }

  return broadcastText;
}

function addBroadcastElement(text) {
  let container = document.getElementById("broadcast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "broadcast-container";
    container.className = "broadcast-container";
    document.body.appendChild(container);
  }
  
  const el = document.createElement("div");
  el.className = "broadcast-message";
  el.innerText = text;
  container.appendChild(el);

  while (container.children.length > 6) {
    container.removeChild(container.firstChild);
  }

  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 1000);
  }, 6000);
}

// History UI Events
const historyBtn = document.getElementById("history-btn");
const historyPanel = document.getElementById("history-panel");
const historyCloseBtn = document.getElementById("history-close-btn");

if (historyBtn) {
  historyBtn.addEventListener("click", () => historyPanel.classList.add("open"));
  historyCloseBtn.addEventListener("click", () => historyPanel.classList.remove("open"));
}

// --- Interactive Fluid Grid Background ---
const canvasBg = document.getElementById('flow-bg');
const ctx = canvasBg.getContext('2d');

function resizeCanvas() {
  canvasBg.width = window.innerWidth;
  canvasBg.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const bubbleStates = new Map();

function drawGrid() {
  ctx.clearRect(0, 0, canvasBg.width, canvasBg.height);
  
  const gridSize = 20 * camera.z;
  let offsetX = camera.x % gridSize;
  let offsetY = camera.y % gridSize;
  
  if (offsetX < 0) offsetX += gridSize;
  if (offsetY < 0) offsetY += gridSize;

  // Cleanup bubbleStates
  for (const el of bubbleStates.keys()) {
    if (!document.body.contains(el)) {
      bubbleStates.delete(el);
    }
  }

  const forces = [];
  const bubbles = document.querySelectorAll('.canvas-message');
  
  bubbles.forEach(el => {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    
    let state = bubbleStates.get(el);
    if (!state) {
      state = { x: cx, y: cy, vx: 0, vy: 0 };
      bubbleStates.set(el, state);
    }
    
    const vx = cx - state.x;
    const vy = cy - state.y;
    state.vx = state.vx * 0.8 + vx * 0.2;
    state.vy = state.vy * 0.8 + vy * 0.2;
    state.x = cx;
    state.y = cy;
    
    const speed = Math.sqrt(state.vx*state.vx + state.vy*state.vy);
    
    let strength = Math.min(speed * 1.5, 30) * camera.z;
    if (el.dataset.isDragging === "true" && strength < 15 * camera.z) {
      strength = 15 * camera.z;
    }
    
    if (strength > 1) {
      forces.push({
        x: cx,
        y: cy,
        vx: state.vx,
        vy: state.vy,
        radius: 180 * camera.z,
        strength: strength
      });
    }
  });

  ctx.fillStyle = '#d5d5d5';

  for (let x = offsetX - gridSize; x < canvasBg.width + gridSize; x += gridSize) {
    for (let y = offsetY - gridSize; y < canvasBg.height + gridSize; y += gridSize) {
      let drawX = x;
      let drawY = y;
      
      for (const f of forces) {
        const dx = drawX - f.x;
        const dy = drawY - f.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < f.radius && dist > 0) {
          const force = Math.pow((f.radius - dist) / f.radius, 2); 
          
          const radialPush = f.strength * 0.3;
          const velocityDrag = 1.2;
          
          drawX += (dx / dist) * force * radialPush;
          drawY += (dy / dist) * force * radialPush;
          
          drawX += f.vx * force * velocityDrag;
          drawY += f.vy * force * velocityDrag;
        }
      }
      
      ctx.beginPath();
      ctx.arc(drawX, drawY, 1.5 * camera.z, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  requestAnimationFrame(drawGrid);
}
requestAnimationFrame(drawGrid);
