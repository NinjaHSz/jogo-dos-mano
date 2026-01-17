// Game Configuration & Static Data
const QUESTIONS = [
    { category: "Lealdade e Ética", text: "Quem aqui seria o primeiro a aceitar 1 milhão de euros para nunca mais falar com ninguém nesta sala?" },
    { category: "Lealdade e Ética", text: "Se alguém cometesse um crime grave por acidente, quem aqui seria a última pessoa que escolherias para te ajudar a esconder as provas?" },
    { category: "Lealdade e Ética", text: "Quem nesta roda é mais provável de estar a manter um segredo que destruiria a reputação de outra pessoa aqui?" },
    { category: "Máscaras Sociais", text: "Quem aqui finge ser uma pessoa muito mais profunda e ética do que realmente é na vida privada?" },
    { category: "Máscaras Sociais", text: "Quem é a pessoa que mais julga silenciosamente as escolhas de vida dos outros amigos aqui presentes?" },
    { category: "Máscaras Sociais", text: "Se todos aqui focassem expostos, quem teria o histórico de internet mais difícil de explicar à família?" },
    { category: "Sobrevivência", text: "Num cenário de escassez extrema, quem aqui seria o primeiro a trair o grupo para garantir a própria sobrevivência?" },
    { category: "Sobrevivência", text: "Quem aqui tu sentes que é a pessoa mais fria e calculista quando se trata de atingir objetivos pessoais?" }
];

// State
let supabase = null;
let channel = null;
let me = { id: crypto.randomUUID(), name: '', isHost: false };
let room = { id: '', players: [], state: 'lobby' };
let currentQuestion = null;
let myVote = null;
let allVotes = {}; // Only used by host or tracked via broadcast

// DOM Elements
const screens = {
    login: document.getElementById('screen-login'),
    menu: document.getElementById('screen-menu'),
    join: document.getElementById('screen-join'),
    waiting: document.getElementById('screen-waiting'),
    game: document.getElementById('screen-game')
};

// --- CONFIGURATION ---

function initSupabase() {
    const url = localStorage.getItem('supa_url');
    const key = localStorage.getItem('supa_key');
    
    if (!url || !key) {
        document.getElementById('setup-alert').classList.remove('hidden');
        return false;
    }
    
    supabase = supabase.createClient(url, key);
    return true;
}

document.getElementById('btn-save-config').addEventListener('click', () => {
    const url = document.getElementById('supa-url').value.trim();
    const key = document.getElementById('supa-key').value.trim();
    if (url && key) {
        localStorage.setItem('supa_url', url);
        localStorage.setItem('supa_key', key);
        location.reload();
    }
});

// --- UI FLOW ---

document.getElementById('btn-login').addEventListener('click', () => {
    const name = document.getElementById('input-name').value.trim();
    if (name) {
        me.name = name;
        showScreen('menu');
    }
});

document.getElementById('btn-create-game').addEventListener('click', () => {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    joinRoom(code, true);
});

document.getElementById('btn-join-view').addEventListener('click', () => showScreen('join'));

document.getElementById('btn-join-room').addEventListener('click', () => {
    const code = document.getElementById('input-room-code').value.trim().toUpperCase();
    if (code.length === 4) joinRoom(code, false);
});

document.getElementById('btn-start-game').addEventListener('click', () => {
    if (!me.isHost) return;
    const q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    channel.send({
        type: 'broadcast',
        event: 'game_start',
        payload: { question: q }
    });
});

document.getElementById('btn-next-question').addEventListener('click', () => {
    if (!me.isHost) return;
    const q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    channel.send({
        type: 'broadcast',
        event: 'new_question',
        payload: { question: q }
    });
});

document.getElementById('btn-back').onclick = () => showScreen('menu');

// --- SUPABASE REALTIME LOGIC ---

async function joinRoom(roomId, isCreating) {
    if (!initSupabase()) return;
    
    room.id = roomId;
    document.getElementById('room-status').textContent = `Sala: ${roomId}`;
    document.getElementById('connection-status').className = 'w-2 h-2 rounded-full bg-yellow-500 animate-pulse';

    // Subscribe to Room Channel
    channel = supabase.channel(`room_${roomId}`, {
        config: { presence: { key: me.id } }
    });

    channel
        .on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            room.players = Object.values(state).map(presence => presence[0]);
            
            // Determine Host (First player in list)
            const host = room.players[0];
            me.isHost = (host.id === me.id);
            
            renderLobby();
            document.getElementById('connection-status').className = 'w-2 h-2 rounded-full bg-wa-accent';
        })
        .on('broadcast', { event: 'game_start' }, ({ payload }) => {
            currentQuestion = payload.question;
            myVote = null;
            allVotes = {};
            showScreen('game');
            renderPoll();
        })
        .on('broadcast', { event: 'new_question' }, ({ payload }) => {
            currentQuestion = payload.question;
            myVote = null;
            allVotes = {};
            renderPoll();
        })
        .on('broadcast', { event: 'vote_submitted' }, ({ payload }) => {
            allVotes[payload.voterId] = payload.votedFor;
            updateVoteUI();
            
            // If everyone voted, results are "implied" or triggered by host
            if (Object.keys(allVotes).length === room.players.length) {
                setTimeout(() => renderPollResults(), 500);
            }
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({ id: me.id, name: me.name });
                showScreen('waiting');
            }
        });
}

// --- RENDER FUNCTIONS ---

function showScreen(id) {
    Object.values(screens).forEach(s => s.classList.add('hidden-screen'));
    screens[id].classList.remove('hidden-screen');
    document.getElementById('btn-back').classList.toggle('hidden', id === 'login' || id === 'menu');
}

function renderLobby() {
    const list = document.getElementById('player-list');
    list.innerHTML = '';
    document.getElementById('room-code-display').textContent = room.id;
    document.getElementById('count-players').textContent = room.players.length;

    room.players.forEach(p => {
        const item = document.createElement('div');
        item.className = 'wa-list-item flex items-center gap-3 p-3 rounded-xl hover:bg-wa-panel/30';
        item.innerHTML = `
            <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm bg-wa-panel text-wa-secondary border border-white/5">
                ${p.name[0].toUpperCase()}
            </div>
            <div class="flex-1">
                <p class="text-sm font-semibold">${p.name} ${p.id === me.id ? '<span class="text-wa-accent text-[10px] ml-1">(Tu)</span>' : ''}</p>
                <p class="text-[10px] text-wa-secondary uppercase tracking-tighter">${room.players[0].id === p.id ? 'Anfitrião' : 'Pronto'}</p>
            </div>
        `;
        list.appendChild(item);
    });

    document.getElementById('btn-start-game').classList.toggle('hidden', !me.isHost);
    document.getElementById('wait-msg').classList.toggle('hidden', me.isHost);
}

function renderPoll() {
    document.getElementById('game-category').textContent = currentQuestion.category;
    document.getElementById('game-question').textContent = currentQuestion.text;
    document.getElementById('vote-info').textContent = "0 votos";
    
    const container = document.getElementById('poll-options');
    container.innerHTML = '';

    room.players.forEach(p => {
        const option = document.createElement('div');
        option.className = 'relative group cursor-pointer overflow-hidden rounded-xl border border-wa-border bg-transparent transition-all hover:bg-white/5';
        option.innerHTML = `
            <div class="flex items-center gap-3 p-4 relative z-10">
                <div class="w-8 h-8 rounded-full bg-wa-secondary/20 flex items-center justify-center text-xs font-bold text-wa-secondary">${p.name[0]}</div>
                <span class="flex-1 text-sm font-medium text-wa-secondary group-hover:text-white">${p.name}</span>
                <div class="vote-check w-5 h-5 rounded-full border-2 border-wa-border flex items-center justify-center">
                    <div class="hidden w-2.5 h-2.5 rounded-full bg-wa-accent"></div>
                </div>
            </div>
        `;
        
        option.onclick = () => {
            if (myVote) return;
            myVote = p.name;
            option.querySelector('.vote-check').classList.add('border-wa-accent');
            option.querySelector('.vote-check div').classList.remove('hidden');
            option.classList.add('border-wa-accent/5', 'bg-wa-accent/5');

            channel.send({
                type: 'broadcast',
                event: 'vote_submitted',
                payload: { voterId: me.id, votedFor: p.name }
            });
        };
        container.appendChild(option);
    });

    document.getElementById('btn-next-question').classList.add('hidden');
    document.getElementById('wait-host-poll').classList.add('hidden');
}

function updateVoteUI() {
    const count = Object.keys(allVotes).length;
    document.getElementById('vote-info').textContent = `${count} ${count === 1 ? 'voto' : 'votos'}`;
}

function renderPollResults() {
    const container = document.getElementById('poll-options');
    container.innerHTML = '';

    const voteCounts = {};
    room.players.forEach(p => voteCounts[p.name] = 0);
    Object.values(allVotes).forEach(name => { if(voteCounts[name] !== undefined) voteCounts[name]++; });

    const total = Object.keys(allVotes).length;
    const playersSorted = [...room.players].sort((a,b) => voteCounts[b.name] - voteCounts[a.name]);

    playersSorted.forEach(p => {
        const count = voteCounts[p.name];
        const percent = total > 0 ? (count / total) * 100 : 0;
        const isMyVote = p.name === myVote;

        const row = document.createElement('div');
        row.className = 'relative rounded-xl overflow-hidden bg-wa-panel/30 border border-white/5 mb-2 h-14';
        row.innerHTML = `
            <div class="poll-bar absolute top-0 left-0 h-full bg-wa-accent/20 z-0" style="width: 0%"></div>
            <div class="flex items-center gap-3 px-4 h-full relative z-10">
                <div class="w-8 h-8 rounded-full bg-wa-secondary/20 flex items-center justify-center text-xs ${isMyVote ? 'text-wa-accent' : 'text-wa-secondary'} font-bold">${p.name[0]}</div>
                <div class="flex-1 flex flex-col">
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-bold">${p.name}</span>
                        ${isMyVote ? '<i class="fas fa-check-circle text-wa-accent text-[10px]"></i>' : ''}
                    </div>
                    <span class="text-[9px] text-wa-secondary">${count} votos</span>
                </div>
                <span class="text-xs font-bold text-wa-accent">${Math.round(percent)}%</span>
            </div>
        `;
        container.appendChild(row);
        setTimeout(() => row.querySelector('.poll-bar').style.width = `${percent}%`, 100);
    });

    if (me.isHost) {
        document.getElementById('btn-next-question').classList.remove('hidden');
    } else {
        document.getElementById('wait-host-poll').classList.remove('hidden');
    }
}

// Initial Check
initSupabase();
