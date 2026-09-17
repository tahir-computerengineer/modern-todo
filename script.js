// Firebase 10.8.0 CDN bağlantıları
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, collection, addDoc, getDocs, query, where,
    updateDoc, deleteDoc, doc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCHeKyvGJxbf7tI4ZaxFpkiWYqmdkf3C7I",
    authDomain: "modern-todo-1c123.firebaseapp.com",
    projectId: "modern-todo-1c123",
    storageBucket: "modern-todo-1c123.firebasestorage.app",
    messagingSenderId: "437367491698",
    appId: "1:437367491698:web:15d48479f569078117c6eb",
    measurementId: "G-YCJYJG3Q7Y"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// DOM Elemanları
const input = document.getElementById('todoInput');
const categoryInput = document.getElementById('todoCategory');
const priorityInput = document.getElementById('todoPriority');
const dateInput = document.getElementById('todoDate');
const recurrenceInput = document.getElementById('todoRecurrence');
const imageInput = document.getElementById('todoImage');
const addBtn = document.getElementById('addBtn');
const todoList = document.getElementById('todoList');
const searchInput = document.getElementById('searchInput');
const filterCategory = document.getElementById('filterCategory');
const exportBtn = document.getElementById('exportBtn');
const darkModeToggle = document.getElementById('darkModeToggle');

// Auth DOM Elemanları
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userProfile = document.getElementById('userProfile');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const sidebarContent = document.querySelector('.input-container');

// Sekme Elemanları
const viewActiveBtn = document.getElementById('viewActiveBtn');
const viewCompletedBtn = document.getElementById('viewCompletedBtn');

let allTasks = []; 
let currentView = 'active'; 
let currentUser = null;
let editingTaskId = null;

document.addEventListener('DOMContentLoaded', () => {
    initDarkMode();
    
    // Oturum Durumu Takipçisi
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            if(userName) userName.textContent = user.displayName;
            if(userAvatar) userAvatar.src = user.photoURL;
            
            if(userProfile) userProfile.style.display = 'flex';
            if(logoutBtn) logoutBtn.style.display = 'block';
            if(loginBtn) loginBtn.style.display = 'none';
            if(sidebarContent) sidebarContent.style.display = 'flex';
            
            loadTodosFromCloud();
        } else {
            currentUser = null;
            if(userProfile) userProfile.style.display = 'none';
            if(logoutBtn) logoutBtn.style.display = 'none';
            if(loginBtn) loginBtn.style.display = 'block';
            if(sidebarContent) sidebarContent.style.display = 'none';
            
            allTasks = [];
            renderTodos();
        }
    });
});

// Giriş Yap
if(loginBtn) {
    loginBtn.addEventListener('click', async () => {
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Giriş hatası: ", error);
            alert("Giriş yapılamadı!");
        }
    });
}

// Çıkış Yap
if(logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Çıkış hatası: ", error);
        }
    });
}

// Sekme Geçişleri
if(viewActiveBtn) {
    viewActiveBtn.addEventListener('click', () => {
        currentView = 'active';
        viewActiveBtn.classList.add('active-tab');
        if(viewCompletedBtn) viewCompletedBtn.classList.remove('active-tab');
        renderTodos();
    });
}

if(viewCompletedBtn) {
    viewCompletedBtn.addEventListener('click', () => {
        currentView = 'completed';
        viewCompletedBtn.classList.add('active-tab');
        if(viewActiveBtn) viewActiveBtn.classList.remove('active-tab');
        renderTodos();
    });
}

// Görev Ekleme VEYA Güncelleme
async function handleSaveTask() {
    if (!currentUser) return alert("İşlem yapmak için giriş yapmalısınız!");
    
    const text = input.value.trim();
    if (!text) return alert("Lütfen görev detayını yazın!");

    const file = imageInput ? imageInput.files[0] : null;
    let imageData = null;

    if (file) {
        if(file.size > 500000) return alert("Resim boyutu 500KB'dan küçük olmalı!");
        imageData = await toBase64(file);
    }

    // DÜZENLEME MODU
    if (editingTaskId) {
        try {
            const taskIndex = allTasks.findIndex(t => t.id === editingTaskId);
            if (taskIndex !== -1) {
                const updatePayload = {
                    text: text,
                    category: categoryInput.value,
                    priority: priorityInput.value,
                    date: dateInput.value,
                    recurrence: recurrenceInput.value
                };
                if (imageData) updatePayload.image = imageData;

                await updateDoc(doc(db, "todos", editingTaskId), updatePayload);

                allTasks[taskIndex] = { ...allTasks[taskIndex], ...updatePayload };
            }
            resetInputs();
            renderTodos();
        } catch (error) {
            console.error("Güncelleme hatası: ", error);
        }
        return;
    }

    // YENİ EKLEME MODU
    const newTask = {
        userId: currentUser.uid,
        text: text,
        category: categoryInput.value,
        priority: priorityInput.value,
        date: dateInput.value,
        recurrence: recurrenceInput.value,
        image: imageData,
        completed: false,
        completionNote: "",
        createdAt: new Date().toISOString()
    };

    try {
        const docRef = await addDoc(collection(db, "todos"), newTask);
        newTask.id = docRef.id; 
        allTasks.unshift(newTask); 
        
        resetInputs();
        currentView = 'active';
        if(viewActiveBtn) viewActiveBtn.click(); 
    } catch (error) {
        console.error("Hata: ", error);
    }
}

// Buluttan Veri Çekme
async function loadTodosFromCloud() {
    if (!currentUser) return;
    try {
        const q = query(collection(db, "todos"), where("userId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        allTasks = [];
        querySnapshot.forEach((doc) => {
            allTasks.push({ id: doc.id, ...doc.data() });
        });
        
        allTasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        renderTodos();
    } catch (error) {
        console.error("Hata: ", error);
    }
}

// Filtreleme ve Çizim
function renderTodos() {
    if(!todoList) return;
    todoList.innerHTML = "";
    const searchText = searchInput ? searchInput.value.toLowerCase() : "";
    const filterCat = filterCategory ? filterCategory.value : "Tümü";

    const filteredTasks = allTasks.filter(task => {
        const matchesSearch = task.text.toLowerCase().includes(searchText);
        const matchesCat = filterCat === "Tümü" || task.category === filterCat;
        const matchesView = currentView === 'active' ? !task.completed : task.completed;
        return matchesSearch && matchesCat && matchesView;
    });

    filteredTasks.forEach(task => createTodoElement(task));
}

// Liste Elemanı Çıktısı (İkonlu Yapı)
function createTodoElement(task) {
    const li = document.createElement('li');
    if (task.completed) li.classList.add('completed');
    
    let timeHtml = "";
    if (task.date && !task.completed) {
        const rem = calculateRemaining(task.date);
        timeHtml = `<span class="time-badge time-${rem.status}">⏱️ ${rem.text}</span>`;
    }

    const recLabels = { "daily": "Her Gün", "weekly": "Her Hafta", "monthly": "Her Ay" };
    const recBadge = (task.recurrence && task.recurrence !== "none") 
        ? `<span class="badge" style="background:#6366f1;">🔄 ${recLabels[task.recurrence]}</span>` 
        : "";

    const imgHtml = task.image ? `<img src="${task.image}" class="task-img">` : "";
    const noteHtml = task.completionNote 
        ? `<div class="completion-note">📝 <strong>Not:</strong> ${task.completionNote}</div>` 
        : "";

    // Butonlar metin yerine SVG İkon ile değiştirildi
    const actionBtn = currentView === 'active' 
        ? `<div class="action-btns">
            <button class="edit-btn" title="Düzenle">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="complete-btn" title="Tamamla">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </button>
           </div>`
        : `<button class="delete-btn" title="Kalıcı Sil">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
           </button>`;

    li.innerHTML = `
        <div class="task-header">
            <div class="task-content">${task.text}</div>
            ${actionBtn}
        </div>
        ${imgHtml}
        ${noteHtml}
        <div class="task-meta">
            <span class="badge cat-${task.category ? task.category.toLowerCase() : 'is'}">${task.category || 'İş'}</span>         
            <span class="badge pri-${task.priority ? task.priority.toLowerCase() : 'orta'}">${task.priority || 'Orta'}</span>
            ${recBadge}         
            ${task.date ? `<span>📅 ${new Date(task.date).toLocaleDateString('tr-TR')}</span>` : ""}         
            ${timeHtml}
        </div>
    `;

    if (currentView === 'active') {
        const editBtn = li.querySelector('.edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();

                editingTaskId = task.id;

                input.value = task.text;
                categoryInput.value = task.category || "İş";
                priorityInput.value = task.priority || "Orta";
                dateInput.value = task.date || "";
                recurrenceInput.value = task.recurrence || "none";

                addBtn.textContent = "Görevi Güncelle";
                addBtn.style.backgroundColor = "#f59e0b";
                
                input.focus();
            });
        }

        const compBtn = li.querySelector('.complete-btn');
        if(compBtn) {
            compBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                const note = prompt("Görev tamamlandı! Eklemek istediğiniz bir not var mı? (Boş bırakabilirsiniz)");
                if (note === null) return; 

                task.completed = true;
                task.completionNote = note;
                
                await updateDoc(doc(db, "todos", task.id), { 
                    completed: true,
                    completionNote: note
                });

                if (task.recurrence && task.recurrence !== 'none' && task.date) {
                    const nextDate = new Date(task.date);
                    if (task.recurrence === 'daily') nextDate.setDate(nextDate.getDate() + 1);
                    if (task.recurrence === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
                    if (task.recurrence === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
                    
                    const offset = nextDate.getTimezoneOffset();
                    const localNextDate = new Date(nextDate.getTime() - (offset*60*1000));
                    const nextDateStr = localNextDate.toISOString().split('T')[0];

                    const nextTask = {
                        userId: currentUser.uid,
                        text: task.text,
                        category: task.category,
                        priority: task.priority,
                        date: nextDateStr,
                        recurrence: task.recurrence,
                        image: task.image,
                        completed: false,
                        completionNote: "",
                        createdAt: new Date().toISOString()
                    };

                    const docRef = await addDoc(collection(db, "todos"), nextTask);
                    nextTask.id = docRef.id;
                    allTasks.unshift(nextTask);
                }
                
                renderTodos(); 
            });
        }
    }

    if (currentView === 'completed') {
        const delBtn = li.querySelector('.delete-btn');
        if(delBtn) {
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if(confirm("Bu geçmiş kaydı tamamen silmek istediğinize emin misiniz?")) {
                    allTasks = allTasks.filter(t => t.id !== task.id);
                    renderTodos();
                    await deleteDoc(doc(db, "todos", task.id));
                }
            });
        }
    }

    todoList.appendChild(li);
}

function calculateRemaining(targetDate) {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const [year, month, day] = targetDate.split('-');
    const target = new Date(year, month - 1, day);
    target.setHours(0,0,0,0);

    const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { text: "Süresi Geçti!", status: "danger" };
    if (diffDays === 0) return { text: "Bugün Son!", status: "danger" };
    if (diffDays === 1) return { text: "1 gün kaldı", status: "warning" };
    return { text: `${diffDays} gün kaldı`, status: "normal" };
}

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(resolve.result || reader.result);
    reader.onerror = error => reject(error);
});

function resetInputs() {
    editingTaskId = null;
    if(input) input.value = "";
    if(dateInput) dateInput.value = "";
    if(imageInput) imageInput.value = "";
    if(priorityInput) priorityInput.value = "Orta";
    if(recurrenceInput) recurrenceInput.value = "none";
    
    if(addBtn) {
        addBtn.textContent = "Görevi Ekle";
        addBtn.style.backgroundColor = "";
    }
}

function exportToCSV() {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; 
    csvContent += "Görev,Not,Kategori,Öncelik,Termin,Periyot,Durum\n";
    
    allTasks.forEach(t => {
        const text = `"${t.text.replace(/"/g, '""')}"`; 
        const note = t.completionNote ? `"${t.completionNote.replace(/"/g, '""')}"` : "-";
        const status = t.completed ? "Tamamlandı" : "Bekliyor";
        const date = t.date ? new Date(t.date).toLocaleDateString('tr-TR') : "-";
        const recurrence = t.recurrence !== 'none' ? t.recurrence : "-";
        csvContent += `${text},${note},${t.category},${t.priority},${date},${recurrence},${status}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "gorev_listesi.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function initDarkMode() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) document.body.classList.add('dark-mode');
    if(darkModeToggle) darkModeToggle.textContent = isDark ? "☀️" : "🌙";
}

if(darkModeToggle) {
    darkModeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('darkMode', isDark);
        darkModeToggle.textContent = isDark ? "☀️" : "🌙";
    });
}

if(addBtn) addBtn.addEventListener('click', handleSaveTask);
if(searchInput) searchInput.addEventListener('input', renderTodos);
if(filterCategory) filterCategory.addEventListener('change', renderTodos);
if(exportBtn) exportBtn.addEventListener('click', exportToCSV);