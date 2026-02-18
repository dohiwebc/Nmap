import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onValue, set, remove, get, update, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyClhejoL8vrU-NDC7vv0RKV_piYw_rlBac",
    authDomain: "n-map-f4cec.firebaseapp.com",
    projectId: "n-map-f4cec",
    storageBucket: "n-map-f4cec.firebasestorage.app",
    messagingSenderId: "905794357999",
    appId: "1:905794357999:web:2cbbf1b304864bfe09691a",
    measurementId: "G-CC1SZ400RG",
    databaseURL: "https://n-map-f4cec-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

provider.setCustomParameters({ prompt: 'select_account' });

let map, service, currentUser, markers = [], autocomplete;

function checkNStudent(email) {
    if (!email) return false;
    const domain = email.split('@')[1];
    return ["nnn.ed.jp", "s.ed.jp", "r.ed.jp"].includes(domain);
}

function startApp() {
    setupTabs();
    if (typeof google !== 'undefined' && google.maps) { initMap(); }
    else { setTimeout(startApp, 200); }
    
    // --- ジャンルアコーディオン ---
    document.getElementById("genre-accordion-btn").onclick = () => {
        document.getElementById("genre-content").classList.toggle("open");
    };

    // --- マイページ：投稿履歴アコーディオン ---
    const myPostsHeader = document.getElementById("my-posts-header");
    if (myPostsHeader) {
        myPostsHeader.onclick = () => {
            const list = document.getElementById("my-posts-list");
            const icon = myPostsHeader.querySelector(".arrow-icon");
            list.classList.toggle("hidden");
            icon.style.transform = list.classList.contains("hidden") ? "rotate(0deg)" : "rotate(180deg)";
        };
    }

    // --- マイページ：行きたいリストアコーディオン ---
    const wishlistHeader = document.getElementById("wishlist-header");
    if (wishlistHeader) {
        wishlistHeader.onclick = () => {
            const list = document.getElementById("my-wishlist-list");
            const icon = wishlistHeader.querySelector(".arrow-icon");
            list.classList.toggle("hidden");
            icon.style.transform = list.classList.contains("hidden") ? "rotate(0deg)" : "rotate(180deg)";
        };
    }

    document.getElementById("current-location-btn").onclick = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                const myLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                map.setCenter(myLoc);
                map.setZoom(17);
            });
        }
    };

    const openPostBtn = document.getElementById("open-post-btn");
    if (openPostBtn) {
        openPostBtn.onclick = () => {
            if (!checkNStudent(currentUser?.email)) {
                alert("店舗登録は学園アカウント(@nnn.ed.jpなど)でのみ可能です。");
                return;
            }
            document.getElementById("modal-view-main").classList.add("hidden");
            document.getElementById("modal-post-form").classList.remove("hidden");
        };
    }
}

async function handleLogin() {
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        if (checkNStudent(user.email)) {
            alert("N高グループ生として認証されました。");
        } else {
            alert("一般アカウントでログインしました。店舗登録には学園アカウントが必要です。");
        }
    } catch (error) {
        console.error("Login failed:", error);
    }
}

document.getElementById("login-btn").onclick = handleLogin;
document.getElementById("login-btn-profile").onclick = handleLogin;

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    const viewMode = document.getElementById("view-mode");
    const loginPrompt = document.getElementById("login-prompt");
    const loginBtnMap = document.getElementById("login-btn");
    const userInfoMap = document.getElementById("user-info");

    if (user) {
        loginBtnMap?.classList.add("hidden");
        userInfoMap?.classList.remove("hidden");
        loginPrompt?.classList.add("hidden");
        viewMode?.classList.remove("hidden");

        const isNStudent = checkNStudent(user.email);
        document.getElementById("n-student-fields")?.classList.toggle("hidden", !isNStudent);
        
        await loadUserProfile();
        loadMyActivity();
        loadAllSpots();
    } else {
        loginBtnMap?.classList.remove("hidden");
        userInfoMap?.classList.add("hidden");
        viewMode?.classList.add("hidden");
        loginPrompt?.classList.remove("hidden");
    }
});

const logoutBtn = document.getElementById("logout-btn-profile");
if (logoutBtn) {
    logoutBtn.onclick = () => {
        if(confirm("ログアウトしますか？")) {
            signOut(auth).then(() => { location.reload(); });
        }
    };
}

// --- プロフィール編集 ---
document.getElementById("edit-profile-btn").onclick = async () => {
    const snap = await get(ref(db, `users/${currentUser.uid}/profile`));
    const data = snap.val() || {};
    const isNStudent = checkNStudent(currentUser.email);

    document.getElementById("edit-name").value = data.name || currentUser.displayName || "";
    document.getElementById("edit-course").value = data.course || (isNStudent ? "通学コース" : "一般ユーザー");
    
    if (isNStudent) {
        if(data.school) {
            const rad = document.querySelector(`input[name="school"][value="${data.school}"]`);
            if(rad) rad.checked = true;
        }
        document.querySelectorAll('input[name="campus"]').forEach(el => {
            el.checked = data.campuses?.includes(el.value);
        });
    }

    document.getElementById("edit-status-input").value = data.status || "オンライン";
    document.getElementById("edit-sns-x").value = data.sns_x || "";
    document.getElementById("edit-sns-insta").value = data.sns_insta || "";
    document.getElementById("edit-sns-tiktok").value = data.sns_tiktok || "";
    document.querySelectorAll('input[name="genre"]').forEach(el => el.checked = data.genres?.includes(el.value));
    
    document.getElementById("view-mode").classList.add("hidden");
    document.getElementById("edit-mode").classList.remove("hidden");
};

document.getElementById("save-profile-btn").onclick = async () => {
    const fileInput = document.getElementById("edit-photo-file");
    const profileRef = ref(db, `users/${currentUser.uid}/profile`);
    const snap = await get(profileRef);
    const existing = snap.val() || {};
    const isNStudent = checkNStudent(currentUser.email);

    let updateData = {
        name: document.getElementById("edit-name").value,
        course: document.getElementById("edit-course").value,
        status: document.getElementById("edit-status-input").value,
        school: isNStudent ? (document.querySelector('input[name="school"]:checked')?.value || "未設定") : "一般",
        campuses: isNStudent ? Array.from(document.querySelectorAll('input[name="campus"]:checked')).map(c => c.value) : [],
        sns_x: document.getElementById("edit-sns-x").value,
        sns_insta: document.getElementById("edit-sns-insta").value,
        sns_tiktok: document.getElementById("edit-sns-tiktok").value,
        genres: Array.from(document.querySelectorAll('input[name="genre"]:checked')).map(c => c.value),
        userTitle: existing.userTitle || "グルメビギナー",
        totalLikes: existing.totalLikes || 0,
        customPhoto: existing.customPhoto || currentUser.photoURL,
        updatedAt: Date.now()
    };

    const finalize = async (photoUrl) => {
        if (photoUrl) updateData.customPhoto = photoUrl;
        await set(profileRef, updateData);
        document.getElementById("edit-mode").classList.add("hidden");
        document.getElementById("view-mode").classList.remove("hidden");
        await loadUserProfile();
    };

    if (fileInput.files[0]) {
        const reader = new FileReader();
        reader.onloadend = () => finalize(reader.result);
        reader.readAsDataURL(fileInput.files[0]);
    } else { await finalize(null); }
};

// --- プロフィール表示 & 投稿履歴管理 ---
async function loadUserProfile() {
    if(!currentUser) return;
    const profileSnap = await get(ref(db, `users/${currentUser.uid}/profile`));
    const data = profileSnap.val() || {};
    const isNStudent = checkNStudent(currentUser.email);
    const spotsSnap = await get(ref(db, `spots`));
    const spotsData = spotsSnap.val() || {};
    
    onValue(ref(db, `reviews`), (allSnap) => {
        let count = 0;
        const historyContainer = document.getElementById("my-posts-list");
        if (historyContainer) historyContainer.innerHTML = "";
        
        if (allSnap.exists()) {
            allSnap.forEach(placeSnap => {
                const placeId = placeSnap.key;
                placeSnap.forEach(revSnap => {
                    const rev = revSnap.val();
                    if (rev.uid === currentUser.uid) {
                        count++;
                        const displayName = rev.placeName || (spotsData[placeId] ? spotsData[placeId].name : "スポット");
                        const div = document.createElement("div");
                        div.className = "history-card";
                        // 親要素に position: relative を追加して×ボタンを固定
                        div.style = "position:relative; background:#fff; border-radius:12px; padding:15px; margin-bottom:12px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); border-left:5px solid #0055aa; cursor:pointer;";
                        div.innerHTML = `
                            <div style="padding-right:30px;">
                                <div style="font-weight:bold; font-size:0.95rem; color:#0055aa; margin-bottom:4px;">📍${displayName}</div>
                                <div style="font-size:0.75rem; color:#666; margin-bottom:8px;">${rev.time}・${rev.price}・${rev.distance}</div>
                                <p style="font-size:0.85rem; margin:8px 0; color:#333; line-height:1.4;">${rev.comment}</p>
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; border-top:1px solid #f0f0f0; pt-8px;">
                                    <div style="display:flex; align-items:center; gap:3px; color:#e74c3c; font-size:0.8rem;">
                                        <span class="material-symbols-outlined" style="font-size:16px; font-variation-settings: 'FILL' 1;">favorite</span>
                                        <span>${rev.likes || 0}</span>
                                    </div>
                                    <div style="font-size:0.7rem; color:#999;">${new Date(rev.createdAt).toLocaleDateString()}</div>
                                </div>
                            </div>
                            <button class="delete-post-btn" style="position:absolute; top:12px; right:12px; border:none; background:#eee; color:#666; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:10;">
                                <span class="material-symbols-outlined" style="font-size:16px;">close</span>
                            </button>
                        `;
                        div.querySelector(".delete-post-btn").onclick = (e) => {
                            e.stopPropagation();
                            if(confirm("この投稿を削除しますか？")) { remove(ref(db, `reviews/${placeId}/${revSnap.key}`)); }
                        };
                        div.onclick = () => { 
                            document.querySelector('[data-target="page-map"]').click(); 
                            getDetails(placeId); 
                        };
                        historyContainer.appendChild(div);
                    }
                });
            });
        }
        if (count === 0 && historyContainer) historyContainer.innerHTML = '<p class="empty-msg" style="text-align:center; color:#999; padding:20px;">まだ投稿はありません</p>';
        document.getElementById("stat-posts").innerText = count;
    });

    const photo = data.customPhoto || currentUser.photoURL;
    document.getElementById("display-photo").src = photo;
    document.getElementById("user-icon").src = photo;
    document.getElementById("display-name").innerText = data.name || currentUser.displayName || "ユーザー";
    document.getElementById("display-title-badge").innerText = data.userTitle || "グルメビギナー";
    document.getElementById("display-status-tag").innerText = data.status || "オンライン";
    
    const nInfoGroup = document.getElementById("n-only-info");
    const displayCampuses = document.getElementById("display-campuses");

    if (isNStudent) {
        nInfoGroup?.classList.remove("hidden");
        document.getElementById("display-course").innerText = data.course || "未設定";
        document.getElementById("display-school").innerText = data.school || "未設定";
        displayCampuses.innerText = (data.campuses && data.campuses.length > 0) ? data.campuses.join(", ") : "未設定";
    } else {
        nInfoGroup?.classList.add("hidden");
        displayCampuses.innerText = "一般ユーザー";
    }

    const setSNS = (id, val, label) => {
        const el = document.getElementById(id);
        if(!el) return;
        if(val) { el.innerText = `${label}: @${val}`; el.classList.remove("hidden"); }
        else { el.classList.add("hidden"); }
    };
    setSNS("sns-x-chip", data.sns_x, "X");
    setSNS("sns-insta-chip", data.sns_insta, "Insta");
    setSNS("sns-tiktok-chip", data.sns_tiktok, "TikTok");

    const genreContainer = document.getElementById("display-genres");
    if(genreContainer) {
        genreContainer.innerHTML = "";
        data.genres?.forEach(g => {
            const span = document.createElement("span");
            span.className = "genre-chip"; span.innerText = g;
            genreContainer.appendChild(span);
        });
    }
}

// --- マップ機能 ---
function initMap() {
    const defaultCenter = { lat: 34.759, lng: 135.496 };
    map = new google.maps.Map(document.getElementById("map"), { center: defaultCenter, zoom: 16, disableDefaultUI: true });
    service = new google.maps.places.PlacesService(map);
    autocomplete = new google.maps.places.Autocomplete(document.getElementById("pac-input"), {
        fields: ["place_id", "geometry", "name"],
        types: ["establishment"]
    });
    autocomplete.addListener("place_changed", () => {
        const p = autocomplete.getPlace();
        if(p.place_id) getDetails(p.place_id);
    });
    map.addListener("click", (e) => { if(e.placeId) { e.stop(); getDetails(e.placeId); } });
}

function getDetails(placeId) {
    service.getDetails({ placeId, fields: ["name", "formatted_address", "geometry", "place_id", "rating", "user_ratings_total", "opening_hours", "url"] }, (place, status) => {
        if (status === "OK") {
            window.currentPlaceForSave = place;
            document.getElementById("modal-place-name").innerText = place.name;
            document.getElementById("modal-place-rating").innerText = place.rating ? `⭐ ${place.rating}` : "評価なし";
            const gCount = document.getElementById("google-review-count");
            if (gCount) gCount.innerText = place.user_ratings_total ? `(${place.user_ratings_total.toLocaleString()}件の口コミ)` : "";

            const mapsLinkBtn = document.getElementById("open-google-maps");
            if (mapsLinkBtn) mapsLinkBtn.href = place.url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=${place.place_id}`;

            const hoursEl = document.getElementById("modal-place-hours");
            if (place.opening_hours && place.opening_hours.weekday_text) {
                const now = new Date();
                const today = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"][now.getDay()];
                let html = '<div style="font-size:0.8rem; color:#666; margin-top:10px; border-top:1px solid #eee; padding-top:10px;">';
                place.opening_hours.weekday_text.forEach(t => {
                    const isToday = t.startsWith(today);
                    html += `<div style="${isToday ? 'color:#0055aa; font-weight:bold; background:#f0f7ff;' : ''}">${t}</div>`;
                });
                hoursEl.innerHTML = html + '</div>';
            } else { hoursEl.innerHTML = '<div style="font-size:0.8rem; color:#999; margin-top:10px;">営業時間情報なし</div>'; }

            const openPostBtn = document.getElementById("open-post-btn");
            if (openPostBtn) {
                const isNStudent = checkNStudent(currentUser?.email);
                if (currentUser && isNStudent) openPostBtn.classList.remove("hidden");
                else openPostBtn.classList.add("hidden");
            }

            loadReviews(placeId);
            document.getElementById("modal-view-main").classList.remove("hidden");
            document.getElementById("modal-post-form").classList.add("hidden");
            document.getElementById("save-modal").style.display = "flex";
        }
    });
}

function loadReviews(placeId) {
    onValue(ref(db, `reviews/${placeId}`), async (snap) => {
        const list = document.getElementById("n-review-list");
        const countBadge = document.getElementById("n-review-count-badge");
        list.innerHTML = "";

        if (snap.exists()) {
            const reviews = Object.values(snap.val());
            if (countBadge) countBadge.innerText = reviews.length;
            for (const d of reviews) {
                const div = document.createElement("div");
                div.className = "review-card";
                div.style = "background:#f8f9fa; border-radius:12px; padding:12px; margin-bottom:12px; border-left:5px solid #0055aa;";
                const likeStatusRef = ref(db, `likes/${d.rid}/${currentUser?.uid}`);
                const likeSnap = await get(likeStatusRef);
                const isLiked = likeSnap.exists();
                div.innerHTML = `
                    <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px;">
                        <img src="${d.userIcon || ''}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">
                        <div>
                            <div style="font-weight:bold; font-size:0.85rem;">${d.userName}</div>
                            <div style="font-size:0.7rem; color:#0055aa;">${d.userTitle || 'グルメビギナー'} / ${d.userCourse || ''}</div>
                        </div>
                    </div>
                    <div style="font-size:0.8rem; font-weight:bold; color:#333;">${d.time}・${d.price}・📍${d.distance}</div>
                    <p style="font-size:0.85rem; line-height:1.4; margin-top:5px;">${d.comment}</p>
                    <div style="display:flex; justify-content:flex-end; align-items:center; margin-top:8px;">
                        <button class="like-btn" data-rid="${d.rid}" style="border:none; background:none; color:${isLiked ? '#e74c3c' : '#ccc'}; display:flex; align-items:center; gap:3px; cursor:pointer;">
                            <span class="material-symbols-outlined" style="font-size:18px; font-variation-settings: 'FILL' ${isLiked ? 1 : 0};">favorite</span>
                            <span class="like-count">${d.likes || 0}</span>
                        </button>
                    </div>
                `;
                div.querySelector(".like-btn").onclick = () => toggleLike(placeId, d.rid, d.uid);
                list.appendChild(div);
            }
        } 
        // --- ここから追加 ---
        else {
            // データがない場合は、バッジを 0 にし、メッセージを表示する
            if (countBadge) countBadge.innerText = "0";
            list.innerHTML = '<p style="text-align:center; font-size:0.8rem; color:#999; padding:10px;">まだレビューがありません</p>';
        }
        // --- ここまで追加 ---
    });
}
async function toggleLike(placeId, reviewId, authorUid) {
    if(!currentUser) return;
    const likeStatusRef = ref(db, `likes/${reviewId}/${currentUser.uid}`);
    const reviewLikesRef = ref(db, `reviews/${placeId}/${reviewId}/likes`);
    const authorProfileRef = ref(db, `users/${authorUid}/profile`);
    const likeSnap = await get(likeStatusRef);
    const isAdding = !likeSnap.exists();
    if (isAdding) { await set(likeStatusRef, true); } 
    else { await remove(likeStatusRef); }
    await runTransaction(reviewLikesRef, (current) => isAdding ? (current || 0) + 1 : Math.max(0, (current || 0) - 1));
    await runTransaction(authorProfileRef, (data) => {
        if (!data) return data;
        data.totalLikes = isAdding ? (data.totalLikes || 0) + 1 : Math.max(0, (data.totalLikes || 0) - 1);
        if(data.totalLikes >= 20) data.userTitle = "伝説の美食家";
        else if(data.totalLikes >= 10) data.userTitle = "グルメマスター";
        else if(data.totalLikes >= 5) data.userTitle = "グルメ通";
        else data.userTitle = "グルメビギナー";
        return data;
    });
}

document.getElementById("submit-post-btn").onclick = async () => {
    if (!checkNStudent(currentUser?.email)) { alert("権限がありません。"); return; }
    const p = window.currentPlaceForSave;
    const snap = await get(ref(db, `users/${currentUser.uid}/profile`));
    const userData = snap.val() || {};
    const rid = push(ref(db, `reviews/${p.place_id}`)).key;
    const reviewData = {
        rid, uid: currentUser.uid,
        placeName: p.name,
        userName: userData.name || currentUser.displayName,
        userIcon: userData.customPhoto || currentUser.photoURL,
        userTitle: userData.userTitle || "グルメビギナー",
        userCourse: userData.course || "",
        time: document.getElementById("post-time").value,
        price: document.getElementById("post-price").value,
        distance: document.getElementById("post-distance").value,
        scenes: Array.from(document.querySelectorAll('input[name="scene"]:checked')).map(c => c.value),
        comment: document.getElementById("post-comment").value,
        likes: 0, createdAt: Date.now()
    };
    await set(ref(db, `reviews/${p.place_id}/${rid}`), reviewData);
    await set(ref(db, `spots/${p.place_id}`), { name: p.name, place_id: p.place_id, lat: p.geometry.location.lat(), lng: p.geometry.location.lng() });
    alert("投稿完了！");
    document.getElementById("modal-post-form").classList.add("hidden");
    document.getElementById("modal-view-main").classList.remove("hidden");
};

function loadAllSpots() {
    onValue(ref(db, 'spots'), (snap) => {
        markers.forEach(m => m.setMap(null)); markers = [];
        snap.forEach(c => {
            const spot = c.val();
            if(spot.lat && spot.lng) {
                const m = new google.maps.Marker({ position: { lat: spot.lat, lng: spot.lng }, map: map });
                m.addListener("click", () => getDetails(spot.place_id || c.key));
                markers.push(m);
            }
        });
    });
}

function loadMyActivity() {
    onValue(ref(db, `users/${currentUser.uid}/wishlist`), (snap) => {
        const container = document.getElementById("my-wishlist-list");
        if(!container) return;
        container.innerHTML = "";
        let count = 0;
        snap.forEach(child => {
            count++;
            const div = document.createElement("div");
            div.className = "wish-tile";
            div.style = "display:flex; align-items:center; justify-content:space-between; background:#fff; padding:10px 15px; border-radius:10px; margin-bottom:8px; box-shadow:0 1px 3px rgba(0,0,0,0.1);";
            div.innerHTML = `<span style="font-size:0.9rem; font-weight:500;">📍 ${child.val().name}</span><button class="wish-tile-del" style="border:none; background:none; color:#ccc; cursor:pointer;"><span class="material-symbols-outlined" style="font-size:18px;">close</span></button>`;
            div.querySelector(".wish-tile-del").onclick = (e) => { e.stopPropagation(); remove(ref(db, `users/${currentUser.uid}/wishlist/${child.key}`)); };
            container.appendChild(div);
        });
        const statWish = document.getElementById("stat-wish");
        if(statWish) statWish.innerText = count;
    });
}

document.getElementById("add-wish-btn").onclick = async () => {
    if (!currentUser) { alert("ログインが必要です"); return; }
    const placeName = window.currentPlaceForSave.name;
    const wishlistRef = ref(db, `users/${currentUser.uid}/wishlist`);
    const snap = await get(wishlistRef);
    let added = false;
    snap.forEach(c => { if(c.val().name === placeName) added = true; });
    if(added) alert("すでに入っています！");
    else { await push(wishlistRef, { name: placeName, createdAt: Date.now() }); alert("追加しました！"); }
};

function setupTabs() {
    const tabs = document.querySelectorAll('.nav-item');
    tabs.forEach(tab => {
        tab.onclick = () => {
            const target = tab.dataset.target;
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            tabs.forEach(t => t.classList.remove('active'));
            document.getElementById(target).classList.add('active');
            tab.classList.add('active');
            if (target === 'page-map' && map) google.maps.event.trigger(map, "resize");
        };
    });
}

document.getElementById("back-to-view-btn").onclick = () => {
    document.getElementById("modal-post-form").classList.add("hidden");
    document.getElementById("modal-view-main").classList.remove("hidden");
};
document.getElementById("close-modal-btn").onclick = () => document.getElementById("save-modal").style.display = "none";

window.onload = startApp;