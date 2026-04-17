const app = document.querySelector('#app');
const phasePill = document.querySelector('#phase-pill');
const timerPill = document.querySelector('#timer-pill');
const toast = document.querySelector('#toast');
const titleToggle = document.querySelector('#title-toggle');

const store = {
  state: null,
  clockOffsetMs: 0,
  playerToken: localStorage.getItem('mafiaPlayerToken') || '',
  roleHidden: localStorage.getItem('mafiaRoleHidden') === '1',
  debug: new URLSearchParams(location.search).get('debug') === '1'
};
localStorage.removeItem('mafiaAdminToken');

let lastRenderKey = '';
let renderPauseUntil = 0;

function setTitleHidden(hidden) {
  document.body.classList.toggle('title-hidden', hidden);
  localStorage.setItem('mafiaTitleHidden', hidden ? '1' : '0');
  if (titleToggle) titleToggle.textContent = hidden ? 'Show title' : 'Hide title';
}

function setRoleHidden(hidden) {
  store.roleHidden = Boolean(hidden);
  localStorage.setItem('mafiaRoleHidden', hidden ? '1' : '0');
}

setTitleHidden(localStorage.getItem('mafiaTitleHidden') === '1');

function pauseRendering(ms = 2500) {
  renderPauseUntil = Math.max(renderPauseUntil, Date.now() + ms);
}

function localSessions() {
  try {
    const parsed = JSON.parse(localStorage.getItem('mafiaPlayerSessions') || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.token) : [];
  } catch {
    return [];
  }
}

function saveLocalSessions(sessions) {
  localStorage.setItem('mafiaPlayerSessions', JSON.stringify(sessions.slice(-24)));
}

function rememberSession(token, name) {
  const sessions = localSessions().filter((item) => item.token !== token);
  sessions.push({ token, name, savedAt: Date.now() });
  saveLocalSessions(sessions);
  store.playerToken = token;
  localStorage.setItem('mafiaPlayerToken', token);
}

function forgetSession(token) {
  saveLocalSessions(localSessions().filter((item) => item.token !== token));
}

function clearLocalSessions() {
  localStorage.removeItem('mafiaPlayerSessions');
  localStorage.removeItem('mafiaPlayerToken');
  store.playerToken = '';
}

function localSessionTokens() {
  return [...new Set([store.playerToken]
    .concat(localSessions().map((session) => session.token))
    .filter(Boolean))];
}

async function readyLocalPlayerSessions() {
  const tokens = localSessionTokens();
  let readied = 0;
  let missing = 0;

  for (const token of tokens) {
    try {
      await api('/api/player/ready', { token, ready: true });
      readied += 1;
    } catch (error) {
      if (/session not found/i.test(error.message)) {
        missing += 1;
        continue;
      }
      if (/Ready is only used in the lobby/i.test(error.message)) break;
      throw error;
    }
  }

  return { readied, missing, total: tokens.length };
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

function updateClockOffset(state) {
  if (Number.isFinite(state?.serverTime)) {
    store.clockOffsetMs = state.serverTime - Date.now();
  }
}

function currentServerTime() {
  return Date.now() + store.clockOffsetMs;
}

function countdownSeconds(state) {
  if (!state?.actionDeadline) return null;
  return Math.max(0, Math.ceil((state.actionDeadline - currentServerTime()) / 1000));
}

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const rest = String(safe % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

function dayVotingOpen(state) {
  return state.phase === 'day' && !state.dayResolved && (!state.actionDeadline || currentServerTime() >= state.actionDeadline);
}

function timerTone(seconds) {
  if (seconds <= 30) return 'red';
  if (seconds <= 60) return 'yellow';
  return '';
}

function renderTimerPill(state) {
  timerPill.className = 'timer-pill';
  if (state.paused) {
    timerPill.hidden = false;
    timerPill.textContent = 'Paused';
    timerPill.classList.add('paused');
    return;
  }
  if (state.phase !== 'day' || state.dayResolved || !state.actionDeadline) {
    timerPill.hidden = true;
    timerPill.textContent = '';
    return;
  }
  const seconds = countdownSeconds(state);
  timerPill.hidden = false;
  timerPill.textContent = seconds > 0 ? `Talk ${formatTime(seconds)}` : 'Vote now';
  const tone = timerTone(seconds);
  if (tone) timerPill.classList.add(tone);
}

function updateLiveTimer(state = store.state) {
  if (!state) return;
  renderTimerPill(state);
  if (state.paused || state.phase !== 'day' || state.dayResolved || !state.actionDeadline) return;

  const clock = document.querySelector('.discussion-clock');
  if (!clock) return;
  const value = clock.querySelector('strong');
  if (!value) return;

  const seconds = countdownSeconds(state);
  const tone = timerTone(seconds);
  clock.className = `discussion-clock${tone ? ` ${tone}` : ''}`;
  value.textContent = seconds > 0 ? formatTime(seconds) : 'Vote now';

  if (seconds === 0 && dayVotingOpen(state) && !state.paused && !isRenderPaused()) {
    render();
    lastRenderKey = renderKey(state);
  }
}

function applyBodyState(state) {
  document.body.classList.toggle('phase-night', state.phase === 'night');
  document.body.classList.toggle('phase-day', state.phase === 'day');
  document.body.classList.toggle('game-paused', Boolean(state.paused));
}

async function api(path, data = {}) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data)
  });
  const payload = await res.json();
  if (!res.ok || payload.ok === false) throw new Error(payload.error || 'Request failed.');
  return payload;
}

function isEditingField() {
  const active = document.activeElement;
  if (!active) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
}

function isRenderPaused() {
  return Date.now() < renderPauseUntil || isEditingField();
}

function renderKey(state) {
  const player = state.player;
  return JSON.stringify({
    gameId: state.gameId,
    phase: state.phase,
    day: state.day,
    night: state.night,
    dayResolved: state.dayResolved,
    winner: state.winner?.message || '',
    winnerTeam: state.winner?.winner || '',
    paused: state.paused,
    actionDeadline: state.actionDeadline || null,
    votingOpen: dayVotingOpen(state),
    playerId: player?.id || '',
    role: player?.role?.key || '',
    roleHidden: store.roleHidden,
    alive: player?.alive,
    ready: player?.ready,
    canResetGame: player?.canResetGame,
    nightChoiceDone: player?.nightChoiceDone,
    ownNightActions: player?.ownNightActions || null,
    witch: player?.witch || null,
    ownVote: player?.ownVote || '',
    reaction: state.currentReaction ? [
      state.currentReaction.id,
      state.currentReaction.type,
      state.currentReaction.actorId,
      state.currentReaction.targetId,
      state.currentReaction.targetName,
      state.currentReaction.isMine
    ] : null,
    playerList: state.players.map((item) => [item.id, item.name, item.alive, item.ready, item.silenced, item.isBot]),
    votes: state.voteTally,
    publicTop: state.publicLog[0]?.text || '',
    privateTop: player?.privateLog?.[0]?.text || '',
    debugPlayers: store.debug ? state.debug?.players?.map((item) => [item.id, item.name, item.preferredRole, item.role?.key]) : null
  });
}

async function refresh(options = {}) {
  const params = new URLSearchParams();
  if (store.playerToken) params.set('token', store.playerToken);
  if (store.debug) params.set('debug', '1');
  const res = await fetch(`/api/state?${params.toString()}`);
  store.state = await res.json();
  updateClockOffset(store.state);
  const nextRenderKey = renderKey(store.state);
  if (!options.force && nextRenderKey === lastRenderKey) {
    updateLiveTimer(store.state);
    return;
  }
  if (!options.force && isRenderPaused()) {
    updateLiveTimer(store.state);
    return;
  }
  render();
  lastRenderKey = nextRenderKey;
}

function phaseLabel(state) {
  if (!state) return 'Loading';
  if (state.phase === 'lobby') return `Lobby ${state.players.length}/${state.limits.maxPlayers}`;
  if (state.phase === 'night') return `Night ${state.night}`;
  if (state.phase === 'day') return state.dayResolved ? `Day ${state.day} resolved` : `Day ${state.day}`;
  if (state.phase === 'reaction') return 'Final choice';
  if (state.phase === 'ended') return 'Game ended';
  return state.phase;
}

function render() {
  const state = store.state;
  if (!state) return;
  applyBodyState(state);
  phasePill.textContent = phaseLabel(state);
  renderTimerPill(state);
  if (store.playerToken && !state.player) {
    forgetSession(store.playerToken);
    localStorage.removeItem('mafiaPlayerToken');
    store.playerToken = '';
  }
  const debugPanel = store.debug ? `<div class="panel">${renderDebugPanel(state)}</div>` : '';
  app.innerHTML = `
    ${state.winner ? `<section class="winner-banner winner-${esc(state.winner.winner)}"><h2>${esc(state.winner.message)}</h2></section>` : ''}
    <section class="layout ${store.debug ? '' : 'two-col'}">
      <div class="panel">${renderPlayerPanel(state)}</div>
      <div class="panel">${renderVillagePanel(state)}</div>
      ${debugPanel}
    </section>
  `;
}

function renderPlayerPanel(state) {
  if (!state.player) {
    return `
      <div class="panel-title"><h2>Join the village</h2><span class="tag">${state.players.length}/${state.limits.maxPlayers}</span></div>
      <div class="action-box">
        <strong>Your screen is your secret card.</strong>
        <p class="small muted">Join with your real name, then press Ready when everyone is in the room.</p>
      </div>
      <form class="stack" data-form="join">
        <label>Your name<input name="name" maxlength="24" autocomplete="name" required></label>
        <button class="good" type="submit">Join village</button>
      </form>
    `;
  }

  const player = state.player;
  const hiddenMode = state.phase !== 'lobby' && store.roleHidden;
  return `
    <div class="panel-title"><h2>${esc(player.name)}</h2>${player.alive ? '<span class="tag green">Alive</span>' : '<span class="tag red">Dead</span>'}</div>
    ${state.phase === 'lobby' ? renderLobbyCard(state) : renderRoleSection(player)}
    ${hiddenMode ? '' : renderStatus(player)}
    ${hiddenMode ? renderHiddenPhaseActions(state) : renderPhaseActions(state)}
    ${renderPrivateLog(player)}
  `;
}

function renderLobbyCard(state) {
  return `
    <article class="action-box">
      <strong>Waiting room</strong>
      <p class="small muted">${state.readyCount}/${state.players.length} players ready. Roles are dealt only when the game starts.</p>
    </article>
  `;
}

function renderRoleCard(role) {
  const fallback = role.imageFallback ? ` onerror="this.onerror=null;this.src='${esc(role.imageFallback)}'"` : '';
  return `
    <article class="role-card ${esc(role.cardClass)}">
      <div class="role-card-top">
        <span class="rarity">${esc(role.rarity)}</span>
        <button class="secondary role-card-toggle" data-action="toggle-role">Hide role card</button>
      </div>
      <h2>${esc(role.name)}</h2>
      ${role.image ? `<img class="role-art" src="${esc(role.image)}" alt="${esc(role.name)} art"${fallback}>` : ''}
      <p>${esc(role.description)}</p>
      <p class="small">Team: ${esc(role.team)}</p>
    </article>
  `;
}

function renderRoleSection(player) {
  if (store.roleHidden) {
    return `
      <article class="role-card hidden-role-card">
        <div class="role-card-top">
          <span class="rarity">Hidden</span>
          <button class="secondary role-card-toggle" data-action="toggle-role">Show role card</button>
        </div>
        <strong>Role card hidden.</strong>
        <p class="small">Show it again when you want to check your art and role text.</p>
      </article>
    `;
  }
  return renderRoleCard(player.role);
}

function shouldShowHiddenPhaseActions(state) {
  const player = state.player;
  if (!player) return false;
  if (state.phase === 'night') {
    return Boolean(
      player.werewolf ||
      player.nightChoiceRequired ||
      (player.items.sword && !player.items.swordUsed) ||
      (player.undertakerRequests && player.undertakerRequests.length > 0)
    );
  }
  if (state.phase === 'day') {
    return Boolean(!state.dayResolved && dayVotingOpen(state) && player.canVote);
  }
  if (state.phase === 'reaction') {
    return Boolean(state.currentReaction?.isMine);
  }
  if (state.phase === 'ended') {
    return Boolean(player.canResetGame);
  }
  return false;
}

function renderHiddenPhaseActions(state) {
  return shouldShowHiddenPhaseActions(state) ? renderPhaseActions(state) : '';
}

function renderStatus(player) {
  const bits = [];
  if (player.status.silenced) bits.push('<span class="tag red">Silenced today</span>');
  if (player.status.lostPowerName) bits.push(`<span class="tag">Lost ${esc(player.status.lostPowerName)}</span>`);
  if (player.items.sword && !player.items.swordUsed) bits.push('<span class="tag gold">Sword ready</span>');
  if (!player.alive && player.role.key === 'deadman' && player.roleState.awake) bits.push('<span class="tag green">Deadman vote active</span>');
  return bits.length ? `<div class="row" style="margin:12px 0">${bits.join('')}</div>` : '';
}

function renderPrivateLog(player) {
  const items = player.privateLog.slice(0, 8).map((item) => `<div class="log-item small">${esc(item.text)}</div>`).join('');
  return `
    <div class="panel-title" style="margin-top:18px"><h3>Private notes</h3></div>
    <div class="log-list">${items || '<p class="muted">Private results will appear here.</p>'}</div>
  `;
}

function renderVillagePanel(state) {
  return `
    <div class="panel-title">
      <h2>Village</h2>
    </div>
    ${renderPlayerList(state)}
    ${renderVoteTally(state)}
    ${renderPublicLog(state)}
  `;
}

function renderPlayerList(state) {
  const rows = state.players.map((player) => `
    <div class="player-row ${player.alive ? '' : 'dead'}">
      <div class="split">
        <strong>${esc(player.name)}</strong>
        <span class="tag ${player.alive ? 'green' : 'red'}">${player.alive ? 'Alive' : 'Dead'}</span>
      </div>
        <div class="row small" style="margin-top:8px">
          ${player.connected ? '<span class="tag green">Online</span>' : '<span class="tag">Away</span>'}
          ${player.isBot ? '<span class="tag">Bot</span>' : ''}
          ${state.phase === 'lobby' && player.ready ? '<span class="tag gold">Ready</span>' : ''}
          ${player.silenced ? '<span class="tag red">Silent</span>' : ''}
          ${player.isSelf ? '<span class="tag">You</span>' : ''}
        </div>
      </div>
  `).join('');
  return `<div class="player-list">${rows || '<p class="muted">No players yet.</p>'}</div>`;
}

function renderVoteTally(state) {
  if (state.phase !== 'day' && state.phase !== 'ended') return '';
  const rows = state.voteTally.map((vote) => `
    <div class="vote-row split">
      <span>${esc(vote.name)}</span>
      <strong>${vote.count}</strong>
    </div>
  `).join('');
  return `
    <div class="panel-title" style="margin-top:18px">
      <h3>Votes</h3><span class="tag">${state.activeVoterCount} voters</span>
    </div>
    <div class="stack">${rows || '<p class="muted">No votes yet.</p>'}</div>
  `;
}

function renderPublicLog(state) {
  const rows = state.publicLog.slice(0, 10).map((item) => `<div class="log-item">${esc(item.text)}</div>`).join('');
  return `
    <div class="panel-title" style="margin-top:18px"><h3>Game log</h3></div>
    <div class="log-list">${rows || '<p class="muted">Game events will appear here.</p>'}</div>
  `;
}

function renderPhaseActions(state) {
  if (state.phase === 'lobby') return renderLobbyActions(state);
  if (state.phase === 'night') return renderNightActions(state);
  if (state.phase === 'day') return renderDayActions(state);
  if (state.phase === 'reaction') return renderReactionActions(state);
  if (state.phase === 'ended') return renderEndedActions(state);
  return '';
}

function renderEndedActions(state) {
  if (state.player?.canResetGame) {
    return `
      <section class="action-box stack">
        <strong>The game is over.</strong>
        <button class="danger" data-action="reset-lobby">Reset game</button>
      </section>
    `;
  }
  return '<section class="action-box"><strong>The game is over.</strong><p class="muted small">The first joined player can reset the game.</p></section>';
}

function renderLobbyActions(state) {
  const player = state.player;
  const canStart = state.players.length >= state.limits.minPlayers;
  if (player.ready) {
    return `
      <section class="action-box stack">
        <strong>You are ready.</strong>
        <p class="muted small">${state.readyCount}/${state.players.length} players ready. The game starts automatically when everyone in the lobby is ready.</p>
        <button class="secondary" data-action="ready" data-ready="false">Not ready</button>
      </section>
    `;
  }
  return `
    <section class="action-box stack">
      <strong>${canStart ? 'Ready when you are.' : `Need ${state.limits.minPlayers - state.players.length} more player${state.limits.minPlayers - state.players.length === 1 ? '' : 's'}.`}</strong>
      <p class="muted small">${state.readyCount}/${state.players.length} players ready. Roles stay hidden until the game starts.</p>
      <button class="good" data-action="ready" data-ready="true">Ready</button>
    </section>
  `;
}

function aliveTargets(state, excludeSelf = false) {
  const selfId = state.player?.id;
  return state.players.filter((player) => player.alive && (!excludeSelf || player.id !== selfId));
}

function deadTargets(state) {
  return state.players.filter((player) => !player.alive);
}

function allTargets(state, excludeSelf = false) {
  const selfId = state.player?.id;
  return state.players.filter((player) => !excludeSelf || player.id !== selfId);
}

function targetOptions(players) {
  return players.map((player) => `<option value="${esc(player.id)}">${esc(player.name)}</option>`).join('');
}

function actionForm(title, action, targets, buttonText, hint = '') {
  if (targets.length === 0) {
    return `<div class="action-box"><strong>${esc(title)}</strong><p class="muted small">No legal targets right now.</p></div>`;
  }
  return `
    <div class="action-box">
      <form data-form="night-action" data-night-action="${esc(action)}">
        <strong>${esc(title)}</strong>
        ${hint ? `<p class="small muted">${esc(hint)}</p>` : ''}
        <select name="targetId">${targetOptions(targets)}</select>
        <button type="submit">${esc(buttonText)}</button>
      </form>
    </div>
  `;
}

function renderNightActions(state) {
  const player = state.player;
  let html = `
    <div class="panel-title" style="margin-top:18px">
      <h3>Night actions</h3>
    </div>
    <div class="actions-grid">
  `;

  if (state.paused) {
    html += '<div class="action-box"><strong>Game paused.</strong><p class="muted small">Night actions are paused from the debug tools.</p></div>';
    return `${html}</div>`;
  }

  if (!player.alive) {
    html += renderUndertakerAnswers(state);
    html += '<div class="action-box"><strong>You are dead tonight.</strong></div>';
    return `${html}</div>`;
  }

  if (player.nightChoiceDone) {
    html += '<div class="action-box"><strong>Your night choice is saved.</strong><p class="muted small">Night resolves when everyone required has acted or skipped, and the Werewolves agree.</p></div>';
  } else {
    html += renderRoleAction(state);
    if (player.items.sword && !player.items.swordUsed) html += actionForm('Sword', 'sword_strike', aliveTargets(state, true), 'Use sword');
    if (player.role.key !== 'witch' && player.nightChoiceRequired) html += '<button class="secondary" data-action="skip-night">Skip night action</button>';
  }

  if (player.werewolf) html += renderWerewolfActions(state);
  html += renderUndertakerAnswers(state);
  html += '</div>';
  return html;
}

function renderRoleAction(state) {
  const player = state.player;
  const role = player.role.key;
  const alive = aliveTargets(state, false);
  const others = aliveTargets(state, true);
  const everyoneElse = allTargets(state, true);
  const dead = deadTargets(state);

  if (role === 'seer') return actionForm('Seer check', 'seer_check', others, 'Check player');
  if (role === 'shamanOracle') return actionForm('Shaman Oracle vision', 'seer_check', others, 'Reveal role');
  if (role === 'witch') return renderWitchAction(state);
  if (role === 'guardian') {
    const targets = alive.filter((target) => (
      target.id !== player.roleState.lastTargetId &&
      !(target.id === player.id && player.roleState.selfUsed)
    ));
    return actionForm('Guardian protection', 'guardian_protect', targets, 'Protect');
  }
  if (role === 'thief' && !player.roleState.used) return actionForm('Thief steal', 'thief_steal', others, 'Steal role');
  if (role === 'dentist') return actionForm('Dentist silence', 'dentist_silence', alive, 'Silence');
  if (role === 'boneMerchant' && !player.roleState.used) return actionForm('Bone Merchant trade', 'bone_trade', dead, 'Trade role');
  if (role === 'prostitute') return actionForm('Prostitute visit', 'prostitute_sleep', others, 'Sleep with player', 'Night effects targeted at either of you swap to the other.');
  if (role === 'blackCat' && player.roleState.tries > 0) return actionForm('Black Cat visit', 'black_cat_visit', others, 'Visit');
  if (role === 'werewolfHunter' && player.roleState.canShoot) return actionForm('Werewolf Hunter shot', 'werewolf_hunter_shoot', alive, 'Shoot');
  if (role === 'hero') return actionForm('Hero sacrifice guard', 'hero_guard', others, 'Guard player');
  if (role === 'healer' && !player.roleState.used) return actionForm('Healer revive', 'healer_revive', dead, 'Revive');
  if (role === 'lawyer' && !player.roleState.used) return actionForm('Lawyer evidence', 'lawyer_accuse', alive, 'Accuse');
  if (role === 'undertaker') return actionForm('Undertaker request', 'undertaker_ask', everyoneElse, 'Ask player', 'Ask any other player for a private note of up to 10 characters.');
  if (role === 'blacksmith' && !player.roleState.used) return actionForm('Blacksmith sword', 'blacksmith_give', alive, 'Forge sword');
  return '<div class="action-box"><strong>No timed night action.</strong><p class="muted small">Stay quiet and watch the village.</p></div>';
}

function renderWitchAction(state) {
  const player = state.player;
  const witch = player.witch || {};
  const actions = player.ownNightActions || {};
  const alive = aliveTargets(state, false);
  const parts = [];

  if (witch.waitingForWerewolves) {
    parts.push('<div class="action-box"><strong>Healing potion waiting</strong><p class="muted small">The Werewolves have not agreed on a victim yet. When they do, you will see who they are targeting.</p></div>');
  }

  if (witch.werewolfVictim) {
    const selfText = witch.werewolfVictim.isSelf ? ' That is you.' : '';
    parts.push(`<div class="action-box"><strong>Werewolf victim</strong><p class="muted small">Werewolves are targeting ${esc(witch.werewolfVictim.name)} tonight.${selfText}</p></div>`);
  }

  if (player.roleState.healPotion) {
    if (actions.witchHeal) {
      parts.push('<div class="action-box"><strong>Healing potion chosen.</strong></div>');
    } else if (witch.werewolfVictim) {
      parts.push(actionForm('Healing potion', 'witch_heal', [witch.werewolfVictim], `Save ${witch.werewolfVictim.name}`, 'Can only be used on the Werewolf victim.'));
    } else if (!witch.waitingForWerewolves) {
      parts.push('<div class="action-box"><strong>Healing potion</strong><p class="muted small">There is no Werewolf victim to heal tonight.</p></div>');
    }
  }

  if (player.roleState.killPotion) {
    if (actions.witchKill) {
      parts.push('<div class="action-box"><strong>Killing potion chosen.</strong></div>');
    } else {
      parts.push(actionForm('Killing potion', 'witch_kill', alive, 'Use killing potion'));
    }
  }

  if (!player.nightChoiceDone && !witch.waitingForWerewolves) {
    parts.push('<button class="secondary" data-action="witch-done">Skip remaining Witch choices</button>');
  }

  return parts.join('') || '<div class="action-box"><strong>Both Witch potions are used.</strong></div>';
}

function renderWerewolfActions(state) {
  const player = state.player;
  const wolfIds = new Set(player.werewolf.wolves.map((wolf) => wolf.id));
  const targets = state.players.filter((target) => target.alive && !wolfIds.has(target.id));
  const votes = player.werewolf.wolves.map((wolf) => {
    const targetName = state.players.find((target) => target.id === wolf.votedTargetId)?.name || 'No vote';
    return `<div class="small">${esc(wolf.name)}: ${esc(targetName)}</div>`;
  }).join('');
  let html = `
    <div class="action-box">
      <strong>Werewolf team</strong>
      <p class="small muted">All living Werewolves must agree on one target. This has no timer.</p>
      ${votes}
      <form data-form="night-action" data-night-action="werewolf_vote" style="margin-top:8px">
        <select name="targetId">${targetOptions(targets)}</select>
        <button class="danger" type="submit">Set team target</button>
      </form>
    </div>
  `;
  if (!player.nightChoiceDone && player.role.key === 'blackWerewolf' && !player.roleState.infectUsed) {
    html += actionForm('Black Werewolf infection', 'black_infect', targets, 'Infect');
  }
  if (!player.nightChoiceDone && player.role.key === 'alphaWerewolf' && player.roleState.alphaKillActive) {
    html += actionForm('Alpha extra kill', 'alpha_kill', targets, 'Alpha kill');
  }
  return html;
}

function renderUndertakerAnswers(state) {
  const requests = state.player.undertakerRequests || [];
  return requests.map((request) => `
    <div class="action-box">
      <form data-form="undertaker-answer" data-request-id="${esc(request.id)}">
        <strong>Undertaker request</strong>
        <p class="small muted">The Undertaker requests your help tonight. Send one word or note of up to 10 characters.</p>
        <input name="answer" maxlength="10" required>
        <button type="submit">Send message</button>
      </form>
      <button class="secondary" data-action="undertaker-skip" data-request-id="${esc(request.id)}">Give no answer</button>
    </div>
  `).join('');
}

function renderDayActions(state) {
  const player = state.player;
  if (state.dayResolved) return '<section class="action-box"><strong>Day is resolved.</strong><p class="muted small">The next night starts automatically in a few seconds.</p></section>';
  if (state.paused) return '<section class="action-box"><strong>Game paused.</strong><p class="muted small">Voting is paused from the debug tools.</p></section>';
  if (!dayVotingOpen(state)) {
    const seconds = countdownSeconds(state);
    const tone = timerTone(seconds);
    return `
      <section class="action-box stack">
        <div class="discussion-clock ${esc(tone)}">
          <span>Talk timer</span>
          <strong>${esc(formatTime(seconds))}</strong>
        </div>
        <strong>Discussion time.</strong>
        <p class="muted small">Voting opens when this timer ends.</p>
      </section>
    `;
  }
  if (!player.canVote) return '<section class="action-box"><strong>You cannot vote today.</strong></section>';
  const targets = state.players.filter((target) => target.alive && target.id !== player.id);
  return `
    <div class="panel-title" style="margin-top:18px"><h3>Vote</h3>${player.ownVote ? '<span class="tag green">Vote saved</span>' : ''}</div>
    ${player.status.silenced ? '<p class="muted">You are silenced for discussion, but your vote still counts.</p>' : ''}
    <div class="button-grid">
      ${targets.map((target) => `<button data-action="vote" data-target="${esc(target.id)}">${esc(target.name)}</button>`).join('')}
      <button class="secondary" data-action="vote" data-target="neutral">Neutral</button>
    </div>
  `;
}

function renderReactionActions(state) {
  const reaction = state.currentReaction;
  if (!reaction) return '';
  if (state.paused) return '<section class="action-box"><strong>Game paused.</strong><p class="muted small">Final choices are paused from the debug tools.</p></section>';
  if (reaction.type === 'hidden') {
    return '<section class="action-box"><strong>A hidden choice is resolving.</strong><p class="muted small">Wait for the village to continue.</p></section>';
  }
  if (reaction.type === 'flowerChild') {
    const targetName = reaction.targetName || 'the voted player';
    if (!reaction.isMine) {
      return '<section class="action-box"><strong>A hidden choice is resolving.</strong><p class="muted small">Wait for the village to continue.</p></section>';
    }
    return `
      <div class="panel-title" style="margin-top:18px"><h3>Flower Child</h3></div>
      <section class="action-box stack">
        <strong>Save ${esc(targetName)} from banishment?</strong>
        <div class="button-grid">
          <button class="good" data-action="reaction" data-target="save">Save ${esc(targetName)}</button>
          <button class="secondary" data-action="reaction" data-target="skip">Let vote pass</button>
        </div>
      </section>
      `;
    }
    if (!reaction.isMine) return '<section class="action-box"><strong>A hidden choice is resolving.</strong><p class="muted small">Wait for the village to continue.</p></section>';
    const targets = state.players.filter((target) => target.alive);
    return `
      <div class="panel-title" style="margin-top:18px"><h3>Final choice</h3></div>
    <div class="button-grid">
      ${targets.map((target) => `<button class="danger" data-action="reaction" data-target="${esc(target.id)}">${esc(target.name)}</button>`).join('')}
      <button class="secondary" data-action="reaction" data-target="skip">Skip</button>
    </div>
  `;
}

function renderDebugPanel(state) {
  const roles = state.debug?.roles || [];
  const players = state.debug?.players || [];
  const sessions = localSessions();
  const localReadyTokens = localSessionTokens();
  const roleOptions = ['<option value="">Random role</option>']
    .concat(roles.map((role) => `<option value="${esc(role.key)}">${esc(role.name)} (${esc(role.rarity)})</option>`))
    .join('');
  const playerRows = players.map((player) => `
    <div class="player-row">
      <div class="split">
        <strong>${esc(player.name)}</strong>
        <span class="tag">${player.isBot ? 'Bot' : 'Human'}</span>
      </div>
      <form data-form="debug-role" data-player-id="${esc(player.id)}" class="stack" style="margin-top:8px">
        <select name="roleKey">
          ${roleOptions.replace(`value="${esc(player.preferredRole)}"`, `value="${esc(player.preferredRole)}" selected`)}
        </select>
        <button class="secondary" type="submit" ${state.phase === 'lobby' ? '' : 'disabled'}>Set test role</button>
      </form>
      ${player.role ? `<p class="small muted">Current role: ${esc(player.role.name)}</p>` : ''}
      <button class="danger" data-action="debug-kick" data-player-id="${esc(player.id)}">Kick</button>
    </div>
  `).join('');

  return `
    <div class="action-box stack">
      <strong>Local multi-player</strong>
      <p class="small muted">Create extra player sessions in this same browser, then switch between them to play each screen.</p>
      <form data-form="join-extra" class="stack">
        <label>New local player<input name="name" maxlength="24" required></label>
        <button class="good" type="submit" ${state.phase === 'lobby' ? '' : 'disabled'}>Join another player</button>
      </form>
      <div class="button-grid">
        ${sessions.map((session) => `
          <button class="${session.token === store.playerToken ? 'gold' : 'secondary'}" data-action="switch-session" data-token="${esc(session.token)}">
            ${esc(session.name)}
          </button>
        `).join('') || '<p class="small muted">Local player sessions will appear here.</p>'}
      </div>
      <button class="good" data-action="debug-ready-local" ${state.phase === 'lobby' && localReadyTokens.length > 0 ? '' : 'disabled'}>Ready local players</button>
      <button class="secondary" data-action="clear-sessions">Forget local sessions</button>
    </div>
    <div class="action-box stack">
      <strong>Test tools</strong>
      <p class="small muted">Use this from your PC for solo testing. Normal phones do not need this panel.</p>
      <div class="button-grid">
        <button class="${state.paused ? 'good' : 'secondary'}" data-action="debug-pause">${state.paused ? 'Resume game' : 'Pause game'}</button>
        <button class="secondary" data-action="debug-add-bots" data-count="4" ${state.phase === 'lobby' ? '' : 'disabled'}>Add 4 bots</button>
        <button class="secondary" data-action="debug-fill-min" ${state.phase === 'lobby' ? '' : 'disabled'}>Fill to 5</button>
        <button class="secondary" data-action="debug-fill-10" ${state.phase === 'lobby' ? '' : 'disabled'}>Fill to 10</button>
        <button class="secondary" data-action="debug-clear-bots" ${state.phase === 'lobby' ? '' : 'disabled'}>Clear bots</button>
        <button class="good" data-action="debug-ready-all" ${state.phase === 'lobby' ? '' : 'disabled'}>Ready test players</button>
        <button class="secondary" data-action="debug-open-voting" ${state.phase === 'day' && !state.dayResolved ? '' : 'disabled'}>Open vote now</button>
        <button class="danger" data-action="debug-reset">Reset now</button>
      </div>
    </div>
    <div class="panel-title" style="margin-top:18px"><h3>Test roles</h3></div>
    <div class="player-list">${playerRows || '<p class="muted">Join or add bots to set test roles.</p>'}</div>
  `;
}

document.addEventListener('focusin', (event) => {
  if (event.target.closest('input, textarea, select')) pauseRendering(12000);
});

document.addEventListener('input', (event) => {
  if (event.target.closest('input, textarea, select')) pauseRendering(6000);
});

document.addEventListener('change', (event) => {
  if (event.target.closest('input, textarea, select')) pauseRendering(3500);
});

document.addEventListener('pointerdown', (event) => {
  if (event.target.closest('form, [data-action], input, textarea, select')) pauseRendering(2000);
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('form');
  if (!form?.dataset.form) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form).entries());
  try {
    if (form.dataset.form === 'join') {
      const payload = await api('/api/player/join', { name: values.name, token: store.playerToken });
      rememberSession(payload.token, values.name);
      showToast('Joined the village.');
    }
    if (form.dataset.form === 'join-extra') {
      const payload = await api('/api/player/join', {
        name: values.name,
        token: store.playerToken,
        forceNew: true
      });
      rememberSession(payload.token, values.name);
      showToast('Extra local player joined.');
    }
    if (form.dataset.form === 'night-action') {
      await api('/api/player/night-action', {
        token: store.playerToken,
        action: form.dataset.nightAction,
        targetId: values.targetId
      });
      showToast('Night action saved.');
    }
    if (form.dataset.form === 'undertaker-answer') {
      await api('/api/player/night-action', {
        token: store.playerToken,
        action: 'undertaker_answer',
        requestId: form.dataset.requestId,
        answer: values.answer
      });
      showToast('Answer sent.');
    }
    if (form.dataset.form === 'debug-role') {
      await api('/api/debug/set-role', {
        playerId: form.dataset.playerId,
        roleKey: values.roleKey
      });
      showToast('Test role saved.');
    }
    await refresh({ force: true });
  } catch (error) {
    showToast(error.message);
  }
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  try {
    if (action === 'ready') {
      await api('/api/player/ready', { token: store.playerToken, ready: button.dataset.ready !== 'false' });
      showToast(button.dataset.ready === 'false' ? 'Not ready.' : 'Ready.');
    }
    if (action === 'vote') {
      await api('/api/player/vote', { token: store.playerToken, targetId: button.dataset.target });
      showToast('Vote saved.');
    }
    if (action === 'reaction') {
      await api('/api/player/reaction', { token: store.playerToken, targetId: button.dataset.target });
      showToast('Final choice saved.');
    }
    if (action === 'skip-night') {
      await api('/api/player/night-action', { token: store.playerToken, action: 'skip_role' });
      showToast('Night action skipped.');
    }
    if (action === 'witch-done') {
      await api('/api/player/night-action', { token: store.playerToken, action: 'witch_done' });
      showToast('Witch choices finished.');
    }
    if (action === 'toggle-role') {
      setRoleHidden(!store.roleHidden);
      render();
      lastRenderKey = renderKey(store.state);
      return;
    }
    if (action === 'undertaker-skip') {
      await api('/api/player/night-action', {
        token: store.playerToken,
        action: 'undertaker_skip',
        requestId: button.dataset.requestId
      });
      showToast('No answer sent.');
    }
    if (action === 'toggle-title') {
      setTitleHidden(!document.body.classList.contains('title-hidden'));
    }
    if (action === 'switch-session') {
      store.playerToken = button.dataset.token;
      localStorage.setItem('mafiaPlayerToken', store.playerToken);
      showToast('Switched player.');
    }
    if (action === 'clear-sessions') {
      clearLocalSessions();
      showToast('Local sessions cleared.');
    }
    if (action === 'reset-lobby') {
      if (confirm('Reset the game and create a fresh lobby?')) {
        await api('/api/game/reset', { token: store.playerToken });
        clearLocalSessions();
      }
    }
    if (action === 'debug-add-bots') {
      await api('/api/debug/add-bots', { count: Number(button.dataset.count || 1) });
      showToast('Bots added.');
    }
    if (action === 'debug-fill-min') {
      await api('/api/debug/add-bots', { count: Math.max(0, 5 - store.state.players.length) });
      showToast('Filled to 5 players.');
    }
    if (action === 'debug-fill-10') {
      await api('/api/debug/add-bots', { count: Math.max(0, 10 - store.state.players.length) });
      showToast('Filled to 10 players.');
    }
    if (action === 'debug-clear-bots') {
      await api('/api/debug/clear-bots');
      showToast('Bots cleared.');
    }
    if (action === 'debug-pause') {
      await api('/api/debug/pause', { paused: !store.state.paused });
      showToast(store.state.paused ? 'Game resumed.' : 'Game paused.');
    }
    if (action === 'debug-kick') {
      const name = button.closest('.player-row')?.querySelector('strong')?.textContent || 'this player';
      if (confirm(`Kick ${name}?`)) {
        await api('/api/debug/kick', { playerId: button.dataset.playerId });
        showToast('Player kicked.');
      }
    }
    if (action === 'debug-ready-local') {
      const result = await readyLocalPlayerSessions();
      showToast(result.missing > 0
        ? `Readied ${result.readied} local players. ${result.missing} old session${result.missing === 1 ? '' : 's'} skipped.`
        : `Readied ${result.readied} local player${result.readied === 1 ? '' : 's'}.`);
    }
    if (action === 'debug-ready-all') {
      await api('/api/debug/ready-all', { token: store.playerToken });
      showToast('Test players readied.');
    }
    if (action === 'debug-open-voting') {
      await api('/api/debug/open-voting');
      showToast('Voting opened.');
    }
    if (action === 'debug-reset') {
      if (confirm('Reset the current game immediately?')) {
        await api('/api/debug/reset');
        clearLocalSessions();
      }
    }
    await refresh({ force: true });
  } catch (error) {
    showToast(error.message);
  }
});

refresh({ force: true }).catch((error) => showToast(error.message));
setInterval(() => {
  updateLiveTimer();
}, 250);
setInterval(() => {
  refresh().catch(() => {});
}, 1000);
