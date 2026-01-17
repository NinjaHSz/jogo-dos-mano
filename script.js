// State
let QUESTIONS = [];
let supaInstance = null;
let channel = null;
let me = { id: (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2)), name: '', isHost: false };
let room = { id: '', players: [], state: 'lobby', presenceCount: 0 };
let currentQuestion = null;
let myVote = []; // Agora armazena o Top 3 [id1, id2, id3]
let allVotes = {}; // { voterId: [votoId1, votoId2, votoId3] }
let usedQuestionIds = []; // Track IDs of questions already used in this session
let gameStep = 0; // Current question number
let sessionScores = {}; // { playerId: totalPoints }
let sessionHistory = []; // [ { question, scores } ]
let currentRoundProcessed = false; // Prevent double scoring for same question

// DOM Elements
const screens = {
    login: document.getElementById('screen-login'),
    menu: document.getElementById('screen-menu'),
    join: document.getElementById('screen-join'),
    waiting: document.getElementById('screen-waiting'),
    game: document.getElementById('screen-game'),
    editor: document.getElementById('screen-editor'),
    rooms: document.getElementById('screen-rooms'),
    finish: document.getElementById('screen-finish')
};

// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = "https://mccplatedzibiqvcvugv.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jY3BsYXRlZHppYmlxdmN2dWd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MjU0NjgsImV4cCI6MjA4NDIwMTQ2OH0.kVGAec_LiLcSCLpKDNqrwiyS8H53EQradUCuFWvNBm0";

async function loadQuestions() {
    try {
        const { data, error } = await supaInstance
            .from('questions')
            .select('id, text');
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            QUESTIONS = data;
            console.log(`${QUESTIONS.length} perguntas carregadas do banco.`);
        } else {
            console.error("Nenhuma pergunta encontrada na tabela 'questions'.");
            QUESTIONS = [{ text: "Nenhuma pergunta encontrada no banco de dados." }];
        }
    } catch (err) {
        console.error("Erro ao carregar perguntas:", err.message);
        QUESTIONS = [{ text: "Falha ao conectar com o banco de perguntas." }];
    }
}

async function initSupabase() {
    if (!supaInstance) {
        // Usa o objeto global 'supabase' da biblioteca para criar a instância
        supaInstance = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        await loadQuestions();
    }
    return true;
}

// Removida lógica de salvamento de config manual
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

document.getElementById('btn-rooms-view').addEventListener('click', () => {
    showScreen('rooms');
    renderRoomsList();
});

document.getElementById('btn-editor-view').addEventListener('click', () => {
    showScreen('editor');
    renderEditor();
});

document.getElementById('btn-add-question').addEventListener('click', async () => {
    const text = document.getElementById('edit-text').value.trim();
    
    if (text) {
        const { error } = await supaInstance
            .from('questions')
            .insert([{ text }]);
            
        if (!error) {
            document.getElementById('edit-text').value = '';
            await loadQuestions();
            renderEditor();
        } else {
            alert('Erro ao salvar pergunta: ' + error.message);
        }
    }
});

document.getElementById('btn-join-room').addEventListener('click', () => {
    const code = document.getElementById('input-room-code').value.trim().toUpperCase();
    if (code.length >= 4) { // Aceita 4 ou mais caracteres gerados pelo random
        joinRoom(code, false);
    } else {
        alert("Digite um código válido de 4 caracteres.");
    }
});

function getNextQuestion() {
    if (QUESTIONS.length === 0) return { text: "Nenhuma pergunta carregada." };

    // Filtra apenas as perguntas que ainda não foram usadas
    const availableQuestions = QUESTIONS.filter(q => !usedQuestionIds.includes(q.id));

    // Se todas foram usadas, retorna null para indicar fim
    if (availableQuestions.length === 0) {
        return null;
    }

    // Sorteia uma das perguntas disponíveis
    const randomIndex = Math.floor(Math.random() * availableQuestions.length);
    const selectedQuestion = availableQuestions[randomIndex];

    // Marca como usada
    usedQuestionIds.push(selectedQuestion.id);
    return selectedQuestion;
}

document.getElementById('btn-start-game').addEventListener('click', () => {
    if (!me.isHost) return;
    const q = getNextQuestion();
    gameStep = usedQuestionIds.length;
    sessionScores = {}; // Reset session
    sessionHistory = [];
    currentRoundProcessed = false;
    channel.send({
        type: 'broadcast',
        event: 'game_start',
        payload: { question: q, step: gameStep }
    });
});

document.getElementById('btn-next-question').addEventListener('click', () => {
    if (!me.isHost) return;
    const q = getNextQuestion();
    
    if (!q) {
        channel.send({
            type: 'broadcast',
            event: 'game_finish'
        });
        return;
    }

    gameStep = usedQuestionIds.length;
    currentRoundProcessed = false;
    channel.send({
        type: 'broadcast',
        event: 'new_question',
        payload: { question: q, step: gameStep }
    });
});

document.getElementById('btn-back').onclick = () => showScreen('menu');

document.getElementById('btn-finish-back').onclick = () => {
    usedQuestionIds = []; // Limpa histórico para a próxima partida
    sessionScores = {};
    sessionHistory = [];
    showScreen('menu');
};

function renderFinalRanking() {
    const globalContainer = document.getElementById('final-global-ranking');
    const historyContainer = document.getElementById('final-history-list');

    // Render Global Ranking
    globalContainer.innerHTML = '';
    const sortedGlobal = Object.entries(sessionScores).sort((a, b) => b[1] - a[1]);
    
    sortedGlobal.forEach(([id, score], index) => {
        const player = room.players.find(p => p.id === id);
        const name = player ? player.name : "Desconhecido";
        
        const item = document.createElement('div');
        item.className = 'flex items-center gap-4 bg-wa-bg/40 p-4 rounded-2xl border border-white/5';
        item.innerHTML = `
            <div class="w-8 h-8 rounded-full ${index === 0 ? 'bg-wa-accent text-wa-bg' : 'bg-wa-panel text-wa-secondary'} flex items-center justify-center font-black text-xs">
                ${index + 1}º
            </div>
            <div class="flex-1 text-left">
                <p class="text-sm font-bold text-white">${name}</p>
                <p class="text-[9px] text-wa-secondary uppercase">${score} pontos totais</p>
            </div>
            ${index === 0 ? '<i class="fas fa-crown text-wa-accent tracking-tighter"></i>' : ''}
        `;
        globalContainer.appendChild(item);
    });

    // Render History
    historyContainer.innerHTML = '';
    sessionHistory.forEach((round, i) => {
        const div = document.createElement('div');
        div.className = 'space-y-3';
        const roundSorted = Object.entries(round.scores).sort((a, b) => b[1] - a[1]);
        
        div.innerHTML = `
            <div class="flex items-start gap-3">
                <span class="text-[10px] bg-wa-accent/10 text-wa-accent px-2 py-0.5 rounded font-black">#${i+1}</span>
                <p class="text-xs font-bold text-white leading-tight">${round.question}</p>
            </div>
            <div class="grid grid-cols-2 gap-2 pl-8">
                ${roundSorted.slice(0, 3).map(([id, pts], idx) => {
                    const player = room.players.find(p => p.id === id);
                    const name = player ? player.name : "Anônimo";
                    return `
                        <div class="flex items-center gap-2">
                            <span class="text-[9px] text-wa-secondary font-bold">${idx + 1}º</span>
                            <span class="text-[10px] text-white truncate">${name}</span>
                            <span class="text-[9px] text-wa-accent font-black">${pts}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        historyContainer.appendChild(div);
    });
}

// --- SUPABASE REALTIME LOGIC ---

async function joinRoom(roomId, isCreating) {
    if (!initSupabase()) return;

    // Limpa conexão anterior se existir para evitar duplicação de ouvintes (e mensagens)
    if (channel) {
        await supaInstance.removeChannel(channel);
        channel = null;
    }

    // Limpa o chat para a nova sala
    document.getElementById('chat-messages').innerHTML = '';
    
    room.id = roomId;
    const roomStatusEl = document.getElementById('room-status');
    if (roomStatusEl) roomStatusEl.textContent = `Sala: ${roomId}`;
    
    const connStatusEl = document.getElementById('connection-status');
    if (connStatusEl) connStatusEl.className = 'w-2 h-2 rounded-full bg-yellow-500 animate-pulse';

    // Subscribe to Room Channel
    channel = supaInstance.channel(`room_${roomId}`, {
        config: { 
            presence: { key: me.id },
            broadcast: { self: true }
        }
    });

    channel
        .on('presence', { event: 'sync' }, async () => {
            const state = channel.presenceState();
            room.players = Object.values(state).map(presence => presence[0]);
            
            // Detectar mudança no número de jogadores
            if (room.presenceCount !== room.players.length) {
                room.presenceCount = room.players.length;
                await updateRoomActivity(roomId, room.presenceCount);
            }

            // Determine Host (First player in list)
            const host = room.players[0];
            if (host) me.isHost = (host.id === me.id);
            
            renderLobby();
            const connStatusEl = document.getElementById('connection-status');
            if (connStatusEl) connStatusEl.className = 'w-2 h-2 rounded-full bg-wa-accent';
        })
        .on('broadcast', { event: 'game_start' }, ({ payload }) => {
            currentQuestion = payload.question;
            gameStep = payload.step || 1;
            myVote = [];
            allVotes = {};
            sessionScores = {};
            sessionHistory = [];
            currentRoundProcessed = false;
            showScreen('game');
            renderPoll();
        })
        .on('broadcast', { event: 'new_question' }, ({ payload }) => {
            currentQuestion = payload.question;
            gameStep = payload.step || (gameStep + 1);
            myVote = [];
            allVotes = {};
            currentRoundProcessed = false;
            renderPoll();
        })
        .on('broadcast', { event: 'game_finish' }, () => {
            renderFinalRanking();
            showScreen('finish');
        })
        .on('broadcast', { event: 'vote_submitted' }, ({ payload }) => {
            allVotes[payload.voterId] = payload.choices;
            updateVoteUI();
            
            // Apenas o HOST decide quando mudar para resultados
            if (me.isHost) {
                const totalPlayers = room.players.length;
                const totalVotes = Object.keys(allVotes).length;
                if (totalVotes >= totalPlayers && totalVotes > 0) {
                    channel.send({ type: 'broadcast', event: 'results_ready' });
                }
            }
        })
        .on('broadcast', { event: 'results_ready' }, () => {
            if (Object.keys(allVotes).length > 0) {
                renderPollResults();
            }
        })
        .on('broadcast', { event: 'chat_message' }, ({ payload }) => {
            receiveMessage(payload);
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({ id: me.id, name: me.name });
                await updateRoomActivity(roomId, 1);
                document.getElementById('chat-container').classList.remove('hidden');
                showScreen('waiting');
            }
        });
}

async function updateRoomActivity(code, count) {
    if (count <= 0) {
        await supaInstance.from('active_rooms').delete().eq('code', code);
    } else {
        await supaInstance.from('active_rooms').upsert({ 
            code, 
            player_count: count,
            updated_at: new Date().toISOString()
        });
    }
}

async function renderRoomsList() {
    const list = document.getElementById('rooms-list');
    list.innerHTML = '<p class="text-center text-[10px] text-wa-secondary py-10 uppercase animate-pulse">Escaneando frequências...</p>';

    const { data, error } = await supaInstance
        .from('active_rooms')
        .select('*')
        .order('updated_at', { ascending: false });

    if (error || !data || data.length === 0) {
        list.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-wa-secondary">
                <i class="fas fa-ghost text-4xl mb-4 opacity-20"></i>
                <p class="text-sm font-bold">Nenhum sussurro vindo das sombras...</p>
                <p class="text-[10px] uppercase mt-1">Todas as salas estão vazias.</p>
            </div>
        `;
        return;
    }

    list.innerHTML = '';
    data.forEach(r => {
        const diff = Math.floor((new Date() - new Date(r.updated_at)) / 1000);
        const timeStr = diff < 60 ? 'Agora' : `${Math.floor(diff/60)} min atrás`;

        const item = document.createElement('div');
        item.className = 'wa-list-item bg-wa-panel/40 p-5 rounded-2xl flex items-center gap-5 border border-white/5 hover:border-blue-500/30 transition-all cursor-pointer';
        item.onclick = () => {
            document.getElementById('input-room-code').value = r.code;
            showScreen('join');
        };
        item.innerHTML = `
            <div class="w-14 h-14 bg-blue-500/10 rounded-full flex flex-col items-center justify-center border border-blue-500/20">
                <span class="text-xl font-mono font-black text-blue-500">${r.code}</span>
            </div>
            <div class="flex-1">
                <p class="text-xs font-bold text-white">Sessão Ativa</p>
                <div class="flex items-center gap-2 mt-1">
                    <span class="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
                    <p class="text-[10px] text-wa-secondary uppercase">${r.player_count} ${r.player_count === 1 ? 'Mano' : 'Manos'} Online</p>
                </div>
            </div>
            <div class="text-right">
                <p class="text-[9px] text-wa-secondary uppercase font-bold">${timeStr}</p>
                <i class="fas fa-chevron-right text-wa-secondary text-[10px] mt-1"></i>
            </div>
        `;
        list.appendChild(item);
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

function renderPollResults() {
    const container = document.getElementById('poll-options');
    container.innerHTML = '';

    const scores = {}; // { playerId: points }
    room.players.forEach(p => scores[p.id] = 0);
    
    // Sistema de Pontos: 1º = 3pts, 2º = 2pts, 3º = 1pt
    Object.values(allVotes).forEach(choices => {
        if (choices[0] && scores[choices[0]] !== undefined) scores[choices[0]] += 3;
        if (choices[1] && scores[choices[1]] !== undefined) scores[choices[1]] += 2;
        if (choices[2] && scores[choices[2]] !== undefined) scores[choices[2]] += 1;
    });

    const maxPointsPossible = Object.keys(allVotes).length * 3;
    const playersSorted = [...room.players].sort((a,b) => (scores[b.id] || 0) - (scores[a.id] || 0));

    // Update Session Data (only once per round)
    if (!currentRoundProcessed) {
        room.players.forEach(p => {
            sessionScores[p.id] = (sessionScores[p.id] || 0) + (scores[p.id] || 0);
        });
        sessionHistory.push({
            question: currentQuestion.text,
            scores: { ...scores } // Salva os scores por ID
        });
        currentRoundProcessed = true;
    }

    playersSorted.forEach((p, index) => {
        const score = scores[p.id] || 0;
        const percent = maxPointsPossible > 0 ? (score / maxPointsPossible) * 100 : 0;
        const myRank = myVote.indexOf(p.id); // -1 se não votei, 0=1º, 1=2º, 2=3º

        const row = document.createElement('div');
        row.className = 'relative rounded-xl overflow-hidden bg-wa-panel/30 border border-white/5 mb-2 h-16';
        row.innerHTML = `
            <div class="poll-bar absolute top-0 left-0 h-full bg-wa-accent/10 z-0" style="width: 0%"></div>
            <div class="flex items-center gap-3 px-4 h-full relative z-10">
                <div class="w-8 h-8 rounded-full bg-wa-secondary/20 flex items-center justify-center text-xs font-bold text-wa-secondary">
                    ${index + 1}º
                </div>
                <div class="flex-1 flex flex-col">
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-bold">${p.name}</span>
                        ${myRank !== -1 ? `<span class="text-[9px] px-1.5 py-0.5 bg-wa-accent/20 text-wa-accent rounded-full font-black">${myRank + 1}º Escolha</span>` : ''}
                    </div>
                    <span class="text-[9px] text-wa-secondary font-bold uppercase tracking-widest">${score} pontos</span>
                </div>
                <div class="text-right">
                    <div class="text-[10px] font-black text-wa-accent">${Math.round(percent)}%</div>
                </div>
            </div>
        `;
        container.appendChild(row);
        setTimeout(() => row.querySelector('.poll-bar').style.width = `${percent}%`, 100);
    });

    if (me.isHost) {
        document.getElementById('btn-next-question').textContent = "Próxima Sombra";
        document.getElementById('btn-next-question').classList.remove('hidden');
        document.getElementById('btn-next-question').onclick = nextBtnOriginalClick;
    } else {
        document.getElementById('wait-host-poll').classList.remove('hidden');
    }
}

function renderPoll() {
    document.getElementById('game-step').textContent = `Pergunta ${gameStep}/${QUESTIONS.length}`;
    document.getElementById('game-question').textContent = currentQuestion.text;
    document.getElementById('vote-info').textContent = "Escalando o Top 3...";
    
    const container = document.getElementById('poll-options');
    container.innerHTML = '';
    myVote = [];

    room.players.forEach(p => {
        const option = document.createElement('div');
        option.id = `opt-${p.id}`;
        option.className = 'relative group cursor-pointer overflow-hidden rounded-xl border border-wa-border bg-transparent transition-all hover:bg-white/5';
        option.innerHTML = `
            <div class="flex items-center gap-3 p-4 relative z-10">
                <div class="w-8 h-8 rounded-full bg-wa-secondary/20 flex items-center justify-center text-xs font-bold text-wa-secondary">${p.name[0]}</div>
                <span class="flex-1 text-sm font-medium text-wa-secondary group-hover:text-white">${p.name}</span>
                <div class="vote-badge hidden w-6 h-6 rounded-full bg-wa-accent text-wa-bg items-center justify-center text-[10px] font-black"></div>
            </div>
        `;
        
        option.onclick = () => {
            if (myVote.includes(p.id)) return;
            const maxVotes = Math.min(3, room.players.length);
            if (myVote.length >= maxVotes) return;

            myVote.push(p.id);
            const badge = option.querySelector('.vote-badge');
            badge.textContent = myVote.length + 'º';
            badge.classList.remove('hidden');
            badge.classList.add('flex');
            option.classList.add('border-wa-accent', 'bg-wa-accent/5');

            if (myVote.length === maxVotes) {
                document.querySelectorAll('#poll-options > div').forEach(el => el.onclick = null);
                channel.send({
                    type: 'broadcast',
                    event: 'vote_submitted',
                    payload: { voterId: me.id, choices: myVote }
                });
                document.getElementById('vote-info').textContent = "Voto enviado! Aguarde...";
            } else {
                document.getElementById('vote-info').textContent = `Escolha o ${myVote.length + 1}º lugar...`;
            }
        };
        container.appendChild(option);
    });

    document.getElementById('btn-next-question').classList.add('hidden');
    document.getElementById('btn-next-question').textContent = "Próxima Sombra"; // Reset text
    document.getElementById('wait-host-poll').classList.add('hidden');
}

function updateVoteUI() {
    const count = Object.keys(allVotes).length;
    document.getElementById('vote-info').textContent = `${count} ${count === 1 ? 'voto' : 'votos'}`;
    
    // Se for host, mostra botão de emergência se houver algum voto mas a sala não fechar sozinha
    if (me.isHost && count > 0) {
        document.getElementById('btn-next-question').textContent = "Encerrar Votação Manual";
        document.getElementById('btn-next-question').classList.remove('hidden');
        document.getElementById('btn-next-question').onclick = () => {
            channel.send({ type: 'broadcast', event: 'results_ready' });
            // Restaura o clique original para a próxima rodada
            setTimeout(() => {
                document.getElementById('btn-next-question').onclick = nextBtnOriginalClick;
            }, 100);
        };
    }
}

const nextBtnOriginalClick = () => {
    if (!me.isHost) return;
    const q = getNextQuestion();
    if (!q) {
        channel.send({ type: 'broadcast', event: 'game_finish' });
        return;
    }
    gameStep = usedQuestionIds.length;
    currentRoundProcessed = false;
    channel.send({ type: 'broadcast', event: 'new_question', payload: { question: q, step: gameStep } });
};

document.getElementById('btn-next-question').onclick = nextBtnOriginalClick;

// --- CHAT LOGIC ---
const chat = {
    isOpen: false,
    unread: 0,
    replyingTo: null, // { sender, text }
    window: document.getElementById('chat-window'),
    btnOpen: document.getElementById('btn-open-chat'),
    input: document.getElementById('chat-input'),
    messages: document.getElementById('chat-messages'),
    badge: document.getElementById('chat-badge'),
    replyBar: document.getElementById('reply-preview-bar'),
    replyUser: document.getElementById('reply-user'),
    replyText: document.getElementById('reply-text')
};

chat.btnOpen.onclick = () => {
    chat.isOpen = !chat.isOpen;
    chat.window.classList.toggle('active', chat.isOpen);
    if (chat.isOpen) {
        chat.unread = 0;
        chat.badge.classList.add('hidden');
        setTimeout(() => chat.input.focus(), 300);
        scrollToBottom();
    }
};

document.getElementById('btn-close-chat').onclick = () => chat.btnOpen.onclick();

document.getElementById('btn-cancel-reply').onclick = clearReply;

document.getElementById('btn-send-chat').onclick = sendChatMessage;
chat.input.onkeypress = (e) => { if (e.key === 'Enter') sendChatMessage(); };

function setReply(sender, text) {
    chat.replyingTo = { sender, text };
    chat.replyUser.textContent = `Respondendo a ${sender}`;
    chat.replyText.textContent = text;
    chat.replyBar.style.display = 'flex';
    chat.input.focus();
}

function clearReply() {
    chat.replyingTo = null;
    chat.replyBar.style.display = 'none';
}

function sendChatMessage() {
    const text = chat.input.value.trim();
    if (text && channel) {
        channel.send({
            type: 'broadcast',
            event: 'chat_message',
            payload: { 
                sender: me.name, 
                senderId: me.id, 
                text,
                reply: chat.replyingTo 
            }
        });
        chat.input.value = '';
        clearReply();
    }
}

function receiveMessage(msg) {
    const isMe = msg.senderId === me.id;
    
    const div = document.createElement('div');
    div.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} mb-3 group relative`;
    
    let replyHtml = '';
    if (msg.reply) {
        replyHtml = `
            <div class="chat-reply-quoted">
                <span class="quoted-user text-wa-accent">${msg.reply.sender === me.name ? 'Você' : msg.reply.sender}</span>
                <span class="quoted-text">${msg.reply.text}</span>
            </div>
        `;
    }

    div.innerHTML = `
        ${!isMe ? `<span class="text-[9px] text-wa-secondary ml-3 mb-1 font-bold uppercase tracking-wider">${msg.sender}</span>` : ''}
        <div class="chat-bubble px-4 py-2.5 rounded-2xl text-[13px] ${isMe ? 'bg-wa-accent text-wa-bg rounded-tr-none' : 'bg-wa-panel text-white rounded-tl-none border border-white/5'}">
            ${replyHtml}
            <div class="leading-relaxed font-medium">${msg.text}</div>
        </div>
    `;
    
    // Bubble Click to reply logic
    div.querySelector('.chat-bubble').onclick = () => setReply(msg.sender, msg.text);

    chat.messages.appendChild(div);
    scrollToBottom();

    if (!chat.isOpen && !isMe) { // Só badge para mensagens de outros
        chat.unread++;
        chat.badge.textContent = chat.unread;
        chat.badge.classList.remove('hidden');
        chat.badge.classList.add('flex');
    }
}

function scrollToBottom() {
    chat.messages.scrollTop = chat.messages.scrollHeight;
}

async function renderEditor() {
    const list = document.getElementById('editor-questions-list');
    list.innerHTML = '<p class="text-[10px] text-center text-wa-secondary py-4 uppercase">Carregando banco...</p>';
    
    // Recarrega do banco para garantir que temos as IDs para deletar
    const { data, error } = await supaInstance.from('questions').select('*');
    if (error) return;

    list.innerHTML = '';
    data.forEach(q => {
        const item = document.createElement('div');
        item.className = 'bg-wa-panel/50 p-3 rounded-xl flex items-start gap-4 border border-white/5';
        item.innerHTML = `
            <div class="flex-1">
                <p class="text-xs font-medium leading-relaxed">${q.text}</p>
            </div>
            <button onclick="deleteQuestion(${q.id})" class="text-wa-secondary hover:text-red-500 p-1 transition-colors">
                <i class="fas fa-trash-alt"></i>
            </button>
        `;
        list.appendChild(item);
    });
}

async function deleteQuestion(id) {
    if (confirm('Tem certeza que quer apagar essa pergunta? Isso some pra todo mundo.')) {
        const { error } = await supaInstance.from('questions').delete().eq('id', id);
        if (!error) {
            await loadQuestions();
            renderEditor();
        }
    }
}

// Expõe para o escopo global para o onclick funcionar
window.deleteQuestion = deleteQuestion;

// Initial Check
initSupabase();
