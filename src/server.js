'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const MAX_PLAYERS = 20;
const MIN_PLAYERS = 5;
const REACTION_MS = 15000;
const DAY_RESULT_MS = 8000;
const DAY_DISCUSSION_MS = 3 * 60 * 1000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const SPECIAL_ROLES = ['seer', 'witch', 'wise', 'jester', 'thief', 'dentist', 'deadman', 'boneMerchant', 'prostitute'];
const COMMON_ROLES = [
  'hunter', 'guardian', 'blackCat', 'assassin', 'cook', 'werewolfHunter', 'hero',
  'healer', 'lawyer', 'undertaker', 'blacksmith', 'moonCursed', 'frostWidow', 'graveBloom',
  'flowerChild'
];

function assetUrl(...fileNames) {
  const found = fileNames.find((fileName) => fs.existsSync(path.join(PUBLIC_DIR, 'assets', fileName)));
  return `/assets/${found || fileNames[0]}`;
}

const ROLE_IMAGE_PATHS = {
  villager: '/assets/villager.png',
  werewolf: '/assets/werewolf.png',
  blackWerewolf: '/assets/black_werewolf.png',
  alphaWerewolf: '/assets/alpha_werewolf.png',
  seer: '/assets/seer.png',
  shamanOracle: assetUrl('shaman_oracle.png', 'seer.png'),
  witch: '/assets/witch.png',
  wise: '/assets/wise.png',
  jester: '/assets/jester.png',
  thief: '/assets/thief.png',
  dentist: '/assets/dentist.png',
  deadman: '/assets/dead-man.png',
  boneMerchant: '/assets/bone_merchant.png',
  prostitute: '/assets/prostitute.png',
  hunter: '/assets/hunter.png',
  guardian: '/assets/guardian.png',
  blackCat: '/assets/black_cat.png',
  assassin: '/assets/assassin.png',
  cook: '/assets/cook.png',
  werewolfHunter: '/assets/werewolf_hunter.png',
  hero: '/assets/hero.png',
  healer: '/assets/healer.png',
  lawyer: '/assets/lawyer.png',
  undertaker: '/assets/undertaker.png',
  blacksmith: '/assets/blacksmith.png',
  moonCursed: '/assets/moon_cursed.png',
  frostWidow: '/assets/frost_widow.png',
  graveBloom: assetUrl('gravebloom.png', 'grave_bloom.png'),
  flowerChild: '/assets/flower_child.png'
};

const ROLE_DEFS = {
  villager: {
    name: 'Villager', rarity: 'common', cardClass: 'plain', team: 'village',
    description: 'No night power. Listen carefully, vote wisely, and help the village find the Werewolves.'
  },
  werewolf: {
    name: 'Werewolf', rarity: 'mythic', cardClass: 'mythic', team: 'werewolf',
    description: 'Choose a person to kill at night, end the village, feast on the dead.'
  },
  blackWerewolf: {
    name: 'Black Werewolf', rarity: 'black mythic', cardClass: 'black-mythic', team: 'werewolf',
    description: 'Vote with the Werewolves. Once per game, infect one living player at night and immediately turn them into a normal Werewolf.'
  },
  alphaWerewolf: {
    name: 'Alpha Werewolf', rarity: 'red mythic', cardClass: 'red-mythic', team: 'werewolf',
    description: 'Vote with the Werewolves. Each night, you may also choose one extra player to kill.'
  },
  seer: {
    name: 'Seer', rarity: 'legendary', cardClass: 'legendary', team: 'village',
    description: 'Every night, check one player and learn privately whether that player is a Werewolf.'
  },
  shamanOracle: {
    name: 'Shaman Oracle', rarity: 'legendary', cardClass: 'legendary', team: 'village',
    description: 'A rare Seer awakening. Every night, check one player and learn their exact role privately.'
  },
  witch: {
    name: 'Witch', rarity: 'legendary', cardClass: 'legendary', team: 'village',
    description: 'You have one healing potion and one killing potion. Each is used once. You see the Werewolf victim before deciding whether to heal, and you may still use the killing potion the same night.'
  },
  wise: {
    name: 'Wise', rarity: 'legendary', cardClass: 'legendary', team: 'village',
    description: 'You survive one Werewolf attack. If the village votes you out, all village-side powers are lost.'
  },
  jester: {
    name: 'Jester', rarity: 'legendary', cardClass: 'legendary', team: 'neutral',
    description: 'You win if the village votes you out. If Werewolves are gone and enough living players can still banish you, the village must avoid voting you out.'
  },
  thief: {
    name: 'Thief', rarity: 'legendary', cardClass: 'legendary', team: 'village',
    description: 'Once per game at night, steal another player’s role. That player becomes a Villager.'
  },
  dentist: {
    name: 'Dentist', rarity: 'legendary', cardClass: 'legendary', team: 'village',
    description: 'Every night, silence one living player. That player cannot speak during the next day discussion.'
  },
  deadman: {
    name: 'Deadman', rarity: 'legendary', cardClass: 'legendary', team: 'village',
    description: 'You play as a simple Villager until you die. After death, you may still discuss and vote during the day.'
  },
  boneMerchant: {
    name: 'Bone Merchant', rarity: 'legendary', cardClass: 'legendary', team: 'village',
    description: 'Once per game at night, trade your role card with one dead player’s role card.'
  },
  prostitute: {
    name: 'Prostitute', rarity: 'legendary', cardClass: 'legendary', team: 'village',
    description: 'Every night, sleep with one living player. Targeted night effects aimed at either of you swap to the other for that night.'
  },
  hunter: {
    name: 'Hunter', rarity: 'rare', cardClass: 'rare', team: 'village',
    description: 'If you die, you may immediately eliminate one living player of your choice.'
  },
  guardian: {
    name: 'Guardian', rarity: 'rare', cardClass: 'rare', team: 'village',
    description: 'Once per night, protect one player from being killed. You may protect yourself once, and you cannot protect the same player on two consecutive nights.'
  },
  blackCat: {
    name: 'Black Cat', rarity: 'rare', cardClass: 'rare', team: 'village',
    description: (player) => `Once per night, visit one player. If they are a Werewolf, both of you die. If not, you lose one try. Tries left: ${player.roleState.tries}.`
  },
  assassin: {
    name: 'Assassin', rarity: 'rare', cardClass: 'rare', team: 'village',
    description: 'If the village votes you out, you may immediately eliminate one living player.'
  },
  cook: {
    name: 'Cook', rarity: 'rare', cardClass: 'rare', team: 'village',
    description: 'You cannot be killed by a Werewolf attack.'
  },
  werewolfHunter: {
    name: 'Werewolf Hunter', rarity: 'rare', cardClass: 'rare', team: 'village',
    description: 'Each night, choose whether to shoot one player. If you shoot a non-Werewolf, you lose this ability. If you shoot a Werewolf, you keep it.'
  },
  hero: {
    name: 'Hero', rarity: 'rare', cardClass: 'rare', team: 'village',
    description: 'You survive one attack of any kind, except being voted out. At night, you may guard one other player by sacrificing yourself if they would die.'
  },
  healer: {
    name: 'Healer', rarity: 'rare', cardClass: 'rare', team: 'village',
    description: 'Once per game at night, return one dead player to life. This can revive someone killed or voted out.'
  },
  lawyer: {
    name: 'Lawyer', rarity: 'rare', cardClass: 'rare', team: 'village',
    description: 'Once per game at night, accuse one player. If you survive the night, evidence opens at dawn and affects the target.'
  },
  undertaker: {
    name: 'Undertaker', rarity: 'rare', cardClass: 'rare', team: 'village',
    description: 'Each night, ask any other player for a private note of up to 10 characters.'
  },
  blacksmith: {
    name: 'Blacksmith', rarity: 'rare', cardClass: 'rare', team: 'village',
    description: 'Once per game at night, forge a sword and give it to one player. That player may use it once on a later night.'
  },
  moonCursed: {
    name: 'Moon-Cursed', rarity: 'rare', cardClass: 'rare', team: 'village',
    description: 'You start as village-side. If a Werewolf attack reaches you, you survive and become a normal Werewolf the next night. Protection blocks the curse.'
  },
  frostWidow: {
    name: 'Frost Widow', rarity: 'rare', cardClass: 'rare', team: 'village',
    description: 'Anyone who targets you at night loses their power. If you are resurrected, this frost no longer triggers.'
  },
  graveBloom: {
    name: 'Gravebloom', rarity: 'rare', cardClass: 'rare', team: 'village',
    description: 'When you die, one random living player loses their power.'
  },
  flowerChild: {
    name: 'Flower Child', rarity: 'rare', cardClass: 'rare', team: 'village',
    description: 'Once per game, stop one player from being banished by the village vote.'
  }
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8'
};

let state = freshState();
let autoTimer = null;
let botTimer = null;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function freshState() {
  return {
    gameId: randomId('game'),
    phase: 'lobby',
    phaseStartedAt: Date.now(),
    actionDeadline: null,
    day: 0,
    night: 0,
    dayResolved: false,
    players: [],
    publicLog: [],
    privateLog: {},
    adminLog: [],
    dayVotes: {},
    nightActions: {},
    werewolfVotes: {},
    lastNightDeaths: [],
    undertakerRequests: [],
    reactionQueue: [],
    currentReaction: null,
    reactionContext: null,
    pendingBanishment: null,
    rolePlan: null,
    botCounter: 0,
    paused: false,
    pausedAt: null,
    pauseRemainingMs: null,
    pauseReactionRemainingMs: null,
    winner: null
  };
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function randomInt(max) {
  return crypto.randomInt(0, max);
}

function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function fail(status, message) {
  throw new HttpError(status, message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function roleDef(role) {
  return ROLE_DEFS[role] || ROLE_DEFS.villager;
}

function roleName(role) {
  return roleDef(role).name;
}

function roleNameWithArticle(role) {
  const name = roleName(role);
  const article = /^[aeiou]/i.test(name) ? 'an' : 'a';
  return `${article} ${name}`;
}

function roleImageFor(player) {
  if (player.role === 'villager' && player.items?.sword && !player.items?.swordUsed) {
    return '/assets/sword_wielder.png';
  }
  return ROLE_IMAGE_PATHS[player.role] || null;
}

function roleCard(player) {
  const def = roleDef(player.role);
  return {
    key: player.role,
    name: def.name,
    rarity: def.rarity,
    cardClass: def.cardClass,
    team: def.team,
    image: roleImageFor(player),
    imageFallback: null,
    description: typeof def.description === 'function' ? def.description(player) : def.description
  };
}

function isWolfRole(role) {
  return roleDef(role).team === 'werewolf';
}

function isPoweredRole(role) {
  return role !== 'villager' && role !== 'werewolf';
}

function blackCatTries(playerCount) {
  if (playerCount <= 5) return 1;
  if (playerCount <= 11) return 2;
  return 3;
}

function defaultRoleState(role, playerCount) {
  switch (role) {
    case 'blackWerewolf': return { infectUsed: false };
    case 'alphaWerewolf': return { alphaKillActive: true };
    case 'witch': return { healPotion: true, killPotion: true };
    case 'wise': return { wolfSurvival: true };
    case 'thief':
    case 'boneMerchant':
    case 'healer':
    case 'lawyer':
    case 'blacksmith':
    case 'flowerChild':
      return { used: false };
    case 'undertaker':
      return {};
    case 'prostitute':
      return { lastTargetId: null };
    case 'guardian': return { selfUsed: false, lastTargetId: null };
    case 'blackCat': return { tries: blackCatTries(playerCount) };
    case 'werewolfHunter': return { canShoot: true };
    case 'hero': return { shield: true };
    case 'deadman': return { awake: false };
    default: return {};
  }
}

function spawnedRole(role) {
  if (role === 'seer' && randomInt(100) < 25) return 'shamanOracle';
  return role;
}

function setRole(player, role) {
  const finalRole = spawnedRole(role);
  player.role = finalRole;
  player.roleState = defaultRoleState(finalRole, state.players.length);
  player.team = roleDef(finalRole).team;
}

function addPublic(text) {
  state.publicLog.unshift({ at: Date.now(), text });
  state.publicLog = state.publicLog.slice(0, 80);
}

function addPrivate(playerId, text) {
  if (!state.privateLog[playerId]) state.privateLog[playerId] = [];
  state.privateLog[playerId].unshift({ at: Date.now(), text });
  state.privateLog[playerId] = state.privateLog[playerId].slice(0, 50);
}

function addAdmin(text) {
  state.adminLog.unshift({ at: Date.now(), text });
  state.adminLog = state.adminLog.slice(0, 140);
}

function clearAutoTimer() {
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = null;
}

function clearBotTimer() {
  if (botTimer) clearTimeout(botTimer);
  botTimer = null;
}

function setAutoTimer(callback, delay) {
  clearAutoTimer();
  autoTimer = setTimeout(() => {
    try {
      callback();
    } catch (error) {
      console.error(error);
    }
  }, Math.max(0, delay));
}

function setBotTimer(callback, delay) {
  clearBotTimer();
  botTimer = setTimeout(() => {
    try {
      callback();
    } catch (error) {
      console.error(error);
    }
  }, Math.max(0, delay));
}

function clearTimers() {
  clearAutoTimer();
  clearBotTimer();
}

function setPaused(paused) {
  const nextPaused = Boolean(paused);
  if (state.paused === nextPaused) return;
  if (nextPaused) {
    state.paused = true;
    state.pausedAt = Date.now();
    state.pauseRemainingMs = state.actionDeadline ? Math.max(0, state.actionDeadline - state.pausedAt) : null;
    state.pauseReactionRemainingMs = state.currentReaction?.deadline ? Math.max(0, state.currentReaction.deadline - state.pausedAt) : null;
    clearTimers();
    addPublic('Game paused by debug tools.');
    return;
  }

  state.paused = false;
  state.pausedAt = null;
  if (state.actionDeadline && state.pauseRemainingMs !== null) {
    state.actionDeadline = Date.now() + state.pauseRemainingMs;
  }
  if (state.currentReaction?.deadline && state.pauseReactionRemainingMs !== null) {
    state.currentReaction.deadline = Date.now() + state.pauseReactionRemainingMs;
  }
  state.pauseRemainingMs = null;
  state.pauseReactionRemainingMs = null;
  addPublic('Game resumed by debug tools.');
  resumePhaseTimers();
}

function resumePhaseTimers() {
  if (state.paused) return;
  if (state.phase === 'night') {
    runNightBots();
    maybeAutoResolveNight();
  } else if (state.phase === 'lobby') {
    maybeAutoStartLobby();
  } else if (state.phase === 'day') {
    if (state.dayResolved) {
      setAutoTimer(() => {
        if (state.phase === 'day' && state.dayResolved && !state.winner && !state.paused) startNightInternal();
      }, DAY_RESULT_MS);
    } else {
      scheduleDayVotingOpen();
    }
  } else if (state.phase === 'reaction') {
    scheduleCurrentReactionTimeout();
  }
}

function getPlayer(id) {
  return state.players.find((player) => player.id === id);
}

function getPlayerByToken(token) {
  return state.players.find((player) => player.token === token);
}

function livingPlayers() {
  return state.players.filter((player) => player.alive);
}

function canVote(player) {
  return Boolean(player && (player.alive || (!player.alive && player.role === 'deadman' && player.roleState.awake)));
}

function activeVoters() {
  return state.players.filter(canVote);
}

function makeSnapshot(query) {
  const viewer = getPlayerByToken(query.token);
  const debug = query.debug === '1';
  if (viewer) viewer.lastSeen = Date.now();

  return {
    gameId: state.gameId,
    serverTime: Date.now(),
    phase: state.phase,
    phaseStartedAt: state.phaseStartedAt,
    actionDeadline: state.actionDeadline,
    paused: Boolean(state.paused),
    day: state.day,
    night: state.night,
    dayResolved: state.dayResolved,
    winner: state.winner,
    limits: { minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS },
    readyCount: state.players.filter((player) => player.ready).length,
    allReady: state.players.length >= MIN_PLAYERS && state.players.every((player) => player.ready),
    deckRule: describeDeckRule(state.players.length),
    rolePlan: state.rolePlan,
    players: state.players.map((player) => playerPublicView(player, viewer)),
    publicLog: state.publicLog,
    nightReadiness: state.phase === 'night' && debug ? makeNightReadiness() : null,
    voteTally: makeVoteTally(),
    activeVoterCount: activeVoters().length,
    currentReaction: state.currentReaction ? publicReaction(state.currentReaction, viewer) : null,
    player: viewer ? makePlayerSnapshot(viewer) : null,
    debug: debug ? makeDebugSnapshot() : null
  };
}

function playerPublicView(player, viewer) {
  const base = {
    id: player.id,
    name: player.name,
    alive: player.alive,
    ready: Boolean(player.ready),
    isBot: Boolean(player.isBot),
    connected: Boolean(player.isBot) || Date.now() - player.lastSeen < 12000,
    silenced: Boolean(player.status.silenced),
    isSelf: Boolean(viewer && viewer.id === player.id)
  };
  return base;
}

function makePlayerSnapshot(player) {
  return {
    id: player.id,
    name: player.name,
    isBot: Boolean(player.isBot),
    alive: player.alive,
    ready: Boolean(player.ready),
    preferredRole: player.preferredRole || '',
    canVote: canVote(player),
    canResetGame: canResetEndedGame(player),
    role: roleCard(player),
    roleState: player.roleState,
    status: player.status,
    items: player.items,
    privateLog: state.privateLog[player.id] || [],
    ownVote: state.dayVotes[player.id] || null,
    ownNightActions: state.nightActions[player.id] || {},
    nightChoiceRequired: state.phase === 'night' ? needsNightChoice(player) : false,
    nightChoiceDone: state.phase === 'night' ? isNightChoiceDone(player) : false,
    witch: player.role === 'witch' ? makeWitchSnapshot(player) : null,
    werewolf: isWolfRole(player.role) ? makeWerewolfSnapshot() : null,
    undertakerRequests: state.phase === 'night'
      ? state.undertakerRequests.filter((request) => (
        request.targetId === player.id && request.night === state.night && !request.answer && !request.skippedAt
      ))
      : []
  };
}

function canResetEndedGame(player) {
  return Boolean(player && state.phase === 'ended' && state.players[0]?.id === player.id);
}

function makeWitchSnapshot(player) {
  const victim = getWitchWerewolfVictim();
  const actions = state.nightActions[player.id] || {};
  return {
    werewolfVictim: victim ? { id: victim.id, name: victim.name, isSelf: victim.id === player.id } : null,
    waitingForWerewolves: witchWaitingForWerewolves(player),
    healChosen: Boolean(actions.witchHeal),
    killChosen: Boolean(actions.witchKill)
  };
}

function makeDebugSnapshot() {
  return {
    roles: Object.entries(ROLE_DEFS).map(([key, def]) => ({
      key,
      name: def.name,
      rarity: def.rarity,
      team: def.team
    })),
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      alive: player.alive,
      ready: Boolean(player.ready),
      isBot: Boolean(player.isBot),
      preferredRole: player.preferredRole || '',
      role: state.phase === 'lobby' ? null : roleCard(player)
    })),
    paused: Boolean(state.paused),
    log: state.adminLog.slice(0, 20)
  };
}

function makeWerewolfSnapshot() {
  const wolves = state.players
    .filter((player) => isWolfRole(player.role) && player.alive)
    .map((player) => ({
      id: player.id,
      name: player.name,
      roleName: roleName(player.role),
      votedTargetId: state.werewolfVotes[player.id] || null
    }));
  return {
    wolves,
    agreedTargetId: getAgreedWerewolfTarget(wolves.map((wolf) => getPlayer(wolf.id)))
  };
}

function publicReaction(reaction, viewer) {
  const isMine = Boolean(viewer && viewer.id === reaction.actorId);
  if (!isMine) {
    return {
      id: reaction.id,
      type: 'hidden',
      actorId: null,
      actorName: 'A hidden power',
      targetId: null,
      targetName: null,
      deadline: reaction.deadline,
      choice: null,
      isMine: false
    };
  }
  const actor = getPlayer(reaction.actorId);
  return {
    id: reaction.id,
    type: reaction.type,
    actorId: reaction.actorId,
    actorName: actor ? actor.name : 'Unknown',
    targetId: reaction.targetId || null,
    targetName: reaction.targetId ? (getPlayer(reaction.targetId)?.name || 'Unknown') : null,
    deadline: reaction.deadline,
    choice: isMine ? reaction.choice : null,
    isMine
  };
}

function makeVoteTally() {
  const tally = {};
  for (const targetId of Object.values(state.dayVotes)) {
    tally[targetId] = (tally[targetId] || 0) + 1;
  }
  return Object.entries(tally).map(([targetId, count]) => ({
    targetId,
    name: targetId === 'neutral' ? 'Neutral' : (getPlayer(targetId)?.name || 'Unknown'),
    count
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function makeNightReadiness() {
  const required = livingPlayers().filter(needsNightChoice);
  const done = required.filter(isNightChoiceDone);
  return {
    required: required.length,
    done: done.length,
    werewolvesReady: werewolvesReady()
  };
}

function describeDeckRule(count) {
  if (count < MIN_PLAYERS) return `Need at least ${MIN_PLAYERS} players.`;
  if (count <= 5) return '1 Werewolf, 1 common role, the rest Villagers.';
  if (count <= 8) return '1 certain Werewolf, 1 pick from Legendary roles plus optional Werewolf, then half common roles and half Villagers.';
  if (count <= 11) return '2 certain Werewolves, 2 Legendary roles, then half common roles and half Villagers.';
  if (count <= 15) return '2 certain Werewolves, 3 picks from Legendary roles plus optional Werewolf, then half common roles and half Villagers.';
  return '3 certain Werewolves, 4 Legendary roles, then half common roles and half Villagers.';
}

function resetPlayerForGame(player) {
  player.alive = true;
  player.items = { sword: false, swordUsed: false };
  player.status = {
    silenced: false,
    nextSilenced: false,
    deadAt: null,
    deathCause: null,
    resurrected: false,
    moonCursedNext: false,
    hunterTriggered: false,
    lostPowerName: null
  };
}

function pickWerewolfVariant() {
  const roll = crypto.randomInt(0, 10000);
  if (roll < 100) return 'alphaWerewolf';
  if (roll < 1100) return 'blackWerewolf';
  return 'werewolf';
}

function buildRoleDeck(count) {
  if (count < MIN_PLAYERS || count > MAX_PLAYERS) fail(400, `Game needs ${MIN_PLAYERS}-${MAX_PLAYERS} players.`);
  if (count <= 5) {
    return [pickWerewolfVariant(), shuffle(COMMON_ROLES)[0], ...Array.from({ length: count - 2 }, () => 'villager')];
  }

  let certainWolves = 1;
  let specialSlots = 1;
  let includeExtraWolf = true;
  if (count >= 9 && count <= 11) {
    certainWolves = 2;
    specialSlots = 2;
    includeExtraWolf = false;
  } else if (count >= 12 && count <= 15) {
    certainWolves = 2;
    specialSlots = 3;
    includeExtraWolf = true;
  } else if (count > 15) {
    certainWolves = 3;
    specialSlots = 4;
    includeExtraWolf = false;
  }

  const specialPool = shuffle([...SPECIAL_ROLES, ...(includeExtraWolf ? ['extraWerewolf'] : [])]);
  const specialPicks = specialPool.slice(0, specialSlots).map((role) => role === 'extraWerewolf' ? pickWerewolfVariant() : role);
  const base = [...Array.from({ length: certainWolves }, () => pickWerewolfVariant()), ...specialPicks];
  const remaining = count - base.length;
  const commonCount = Math.floor(remaining / 2);
  const villagerCount = remaining - commonCount;
  return [...base, ...shuffle(COMMON_ROLES).slice(0, commonCount), ...Array.from({ length: villagerCount }, () => 'villager')];
}

function summarizeDeck(deck, forcedCount = 0) {
  const counts = {};
  for (const role of deck) counts[roleName(role)] = (counts[roleName(role)] || 0) + 1;
  return {
    total: deck.length,
    wolves: deck.filter((role) => isWolfRole(role)).length,
    legendary: deck.filter((role) => roleDef(role).rarity === 'legendary').length,
    rare: deck.filter((role) => roleDef(role).rarity === 'rare').length,
    villagers: counts.Villager || 0,
    forced: forcedCount
  };
}

function assignRoles() {
  const deck = buildRoleDeck(state.players.length);
  const forcedPlayers = shuffle(state.players.filter((player) => player.preferredRole && ROLE_DEFS[player.preferredRole]));
  const randomPlayers = shuffle(state.players.filter((player) => !forcedPlayers.includes(player)));
  const remainingDeck = shuffle([...deck]);
  state.privateLog = {};

  for (const player of forcedPlayers) {
    removeDeckCardForForcedRole(remainingDeck, player.preferredRole);
    resetPlayerForGame(player);
    setRole(player, player.preferredRole);
    addPrivate(player.id, `Debug role set: ${roleName(player.role)}.`);
  }

  randomPlayers.forEach((player, index) => {
    resetPlayerForGame(player);
    setRole(player, remainingDeck[index]);
    addPrivate(player.id, `Your role is ${roleName(player.role)}.`);
  });

  state.rolePlan = summarizeDeck(state.players.map((player) => player.role), forcedPlayers.length);
  addAdmin(`Deck assigned: ${state.players.map((player) => `${player.name}=${roleName(player.role)}`).join(', ')}`);
}

function removeDeckCardForForcedRole(deck, forcedRole) {
  const matchingIndex = deck.indexOf(forcedRole);
  if (matchingIndex >= 0) {
    deck.splice(matchingIndex, 1);
    return;
  }
  const villagerIndex = deck.indexOf('villager');
  if (villagerIndex >= 0) {
    deck.splice(villagerIndex, 1);
    return;
  }
  deck.splice(randomInt(deck.length), 1);
}

function startGame() {
  if (state.phase !== 'lobby') fail(400, 'The game has already started.');
  if (state.players.length < MIN_PLAYERS) fail(400, `Need at least ${MIN_PLAYERS} players.`);
  clearTimers();
  assignRoles();
  state.publicLog = [];
  addPublic('The village gates close. Roles are secret. Night begins.');
  startNightInternal();
}

function startNightInternal() {
  clearTimers();
  state.phase = 'night';
  state.phaseStartedAt = Date.now();
  state.actionDeadline = null;
  state.dayResolved = false;
  state.night += 1;
  state.nightActions = {};
  state.werewolfVotes = {};
  state.undertakerRequests = [];
  state.dayVotes = {};
  state.lastNightDeaths = [];
  state.reactionQueue = [];
  state.currentReaction = null;
  state.reactionContext = null;
  state.pendingBanishment = null;

  for (const player of state.players) {
    player.status.silenced = false;
    if (player.alive && player.role === 'moonCursed' && player.status.moonCursedNext && !player.status.resurrected) {
      setRole(player, 'werewolf');
      addPrivate(player.id, 'The moon curse took hold. You are now a normal Werewolf.');
      addAdmin(`${player.name} became a Werewolf through Moon-Cursed.`);
    }
    player.status.moonCursedNext = false;
  }

  addPublic(`Night ${state.night} begins. Choose a night action or skip. Werewolves must agree on one target.`);
  if (!state.paused) {
    runNightBots();
    maybeAutoResolveNight();
  }
}

function startNextNight() {
  if (state.phase !== 'day' || !state.dayResolved) fail(400, 'Resolve the current day before starting night.');
  startNightInternal();
}

function submitVote(player, targetId) {
  if (state.phase !== 'day' || state.dayResolved) fail(400, 'Voting is not open.');
  if (state.paused) fail(400, 'Game is paused.');
  if (!dayVotingOpen()) fail(400, 'Discussion time is still active. Voting opens when the timer ends.');
  if (!canVote(player)) fail(403, 'You cannot vote right now.');
  const cleanTarget = targetId === 'neutral' ? 'neutral' : String(targetId || '');
  if (cleanTarget !== 'neutral') {
    const target = getPlayer(cleanTarget);
    if (!target || !target.alive) fail(400, 'Vote target must be a living player.');
    if (target.id === player.id) fail(400, 'You cannot vote for yourself.');
  }
  state.dayVotes[player.id] = cleanTarget;
  addAdmin(`${player.name} voted for ${cleanTarget === 'neutral' ? 'Neutral' : getPlayer(cleanTarget).name}.`);
  maybeAutoResolveDay();
}

function maybeAutoResolveDay() {
  if (state.paused) return;
  if (state.phase !== 'day' || state.dayResolved) return;
  if (!dayVotingOpen()) return;
  const voters = activeVoters();
  const votes = Object.values(state.dayVotes);
  const majority = voteMajority(voters.length);
  const neutralVotes = votes.filter((vote) => vote === 'neutral').length;
  if (neutralVotes >= Math.ceil(voters.length / 2)) {
    finishDayWithoutBanish('Half the voters chose Neutral. Nobody is banished.');
    return;
  }
  const tally = {};
  for (const vote of votes) {
    if (vote !== 'neutral') tally[vote] = (tally[vote] || 0) + 1;
  }
  if (Object.values(tally).some((count) => count >= majority)) {
    resolveDay();
    return;
  }
  if (votes.length >= voters.length && voters.length > 0) {
    const outcome = getVoteOutcome();
    if (!outcome.targetId) finishDayWithoutBanish(outcome.reason);
    else resolveDay();
  }
}

function voteMajority(voterCount) {
  return Math.floor(voterCount / 2) + 1;
}

function dayVotingOpen() {
  return state.phase === 'day' && !state.dayResolved && (!state.actionDeadline || Date.now() >= state.actionDeadline);
}

function getVoteOutcome() {
  const tally = {};
  for (const vote of Object.values(state.dayVotes)) tally[vote] = (tally[vote] || 0) + 1;
  if ((tally.neutral || 0) >= Math.ceil(activeVoters().length / 2)) {
    return { targetId: null, reason: 'Half the voters chose Neutral. Nobody is banished.' };
  }
  const entries = Object.entries(tally).filter(([targetId]) => targetId !== 'neutral').sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return { targetId: null, reason: 'No banishment vote passed.' };
  if (entries.length > 1 && entries[0][1] === entries[1][1]) {
    return { targetId: null, reason: 'The vote split between players. Nobody is banished.' };
  }
  return { targetId: entries[0][0], reason: 'Vote passed.' };
}

function resolveDay() {
  if (state.phase !== 'day' || state.dayResolved) fail(400, 'Day voting is not open.');
  const outcome = getVoteOutcome();
  if (!outcome.targetId) {
    finishDayWithoutBanish(outcome.reason);
    return;
  }
  const target = getPlayer(outcome.targetId);
  if (!target || !target.alive) {
    finishDayWithoutBanish('The vote target is no longer alive. Nobody is banished.');
    return;
  }
  if (queueFlowerChildSave(target)) return;
  completeBanishment(target);
}

function queueFlowerChildSave(target) {
  const flowerChild = livingPlayers().find((player) => player.role === 'flowerChild' && !player.roleState.used);
  if (!flowerChild || !target?.alive) return false;
  state.pendingBanishment = { targetId: target.id };
  queueReaction(flowerChild, 'flowerChild', { targetId: target.id });
  beginReaction('day');
  return true;
}

function completeBanishment(target) {
  if (!target || !target.alive) {
    finishDayWithoutBanish('The vote target is no longer alive. Nobody is banished.');
    return;
  }
  const roleBefore = target.role;
  killPlayer(target, 'banished by vote', 'vote');
  addPublic(`${target.name} was banished by vote.`);
  if (roleBefore === 'jester') {
    endGame('jester', 'A secret win condition was fulfilled. A hidden player wins immediately.');
    return;
  }
  if (roleBefore === 'wise') {
    stripVillagePowers();
    addPublic('A hidden village power was lost.');
  }
  if (checkWin()) return;
  if (state.reactionQueue.length > 0) {
    beginReaction('day');
    return;
  }
  finishDayResolved();
}

function finishDayWithoutBanish(reason) {
  addPublic(reason);
  if (checkWin()) return;
  finishDayResolved();
}

function finishDayResolved() {
  clearTimers();
  state.phase = 'day';
  state.dayResolved = true;
  state.phaseStartedAt = Date.now();
  state.actionDeadline = null;
  state.pendingBanishment = null;
  if (!state.winner && !state.paused) {
    setAutoTimer(() => {
      if (state.phase === 'day' && state.dayResolved && !state.winner && !state.paused) startNightInternal();
    }, DAY_RESULT_MS);
  }
}

function submitNightAction(player, body) {
  const action = String(body.action || '');
  if (state.phase !== 'night') fail(400, 'Night actions are not open.');
  if (state.paused) fail(400, 'Game is paused.');
  if (action === 'undertaker_answer' || action === 'undertaker_skip') {
    answerUndertaker(player, body, action === 'undertaker_skip');
    if (state.players.some((candidate) => candidate.isBot)) runNightBots();
    else maybeAutoResolveNight();
    return;
  }
  if (!player.alive) fail(403, 'Dead players cannot use night powers.');
  if (!state.nightActions[player.id]) state.nightActions[player.id] = {};
  const targetId = body.targetId ? String(body.targetId) : null;

  switch (action) {
    case 'skip_role':
      if (player.role === 'witch' && witchWaitingForWerewolves(player)) {
        fail(400, 'Wait for the Werewolves to choose a victim before skipping the healing potion.');
      }
      state.nightActions[player.id].skipRole = { at: Date.now() };
      break;
    case 'witch_done':
      requireRole(player, 'witch');
      if (witchWaitingForWerewolves(player)) {
        fail(400, 'Wait for the Werewolves to choose a victim before finishing Witch choices.');
      }
      state.nightActions[player.id].witchDone = { at: Date.now() };
      break;
    case 'seer_check':
      if (player.role !== 'seer' && player.role !== 'shamanOracle') fail(403, 'Only Seer can do that.');
      requireAliveTarget(targetId);
      if (targetId === player.id) fail(400, 'Choose another player.');
      state.nightActions[player.id].seerCheck = { targetId };
      break;
    case 'witch_heal':
      requireRole(player, 'witch');
      if (!player.roleState.healPotion) fail(400, 'Healing potion is already used.');
      {
        const victim = getWitchWerewolfVictim();
        if (!victim) fail(400, 'No Werewolf victim is known yet.');
        if (targetId !== victim.id) fail(400, 'The healing potion can only save the Werewolf victim.');
      }
      state.nightActions[player.id].witchHeal = { targetId };
      break;
    case 'witch_kill':
      requireRole(player, 'witch');
      if (!player.roleState.killPotion) fail(400, 'Killing potion is already used.');
      requireAliveTarget(targetId);
      state.nightActions[player.id].witchKill = { targetId };
      break;
    case 'guardian_protect':
      requireRole(player, 'guardian');
      requireAliveTarget(targetId);
      if (targetId === player.id && player.roleState.selfUsed) fail(400, 'You already protected yourself once.');
      if (targetId === player.roleState.lastTargetId) fail(400, 'Guardian cannot protect the same player on consecutive nights.');
      state.nightActions[player.id].guardianProtect = { targetId };
      break;
    case 'thief_steal':
      requireRole(player, 'thief');
      if (player.roleState.used) fail(400, 'Thief power is already used.');
      requireAliveTarget(targetId);
      if (targetId === player.id) fail(400, 'Choose another player.');
      state.nightActions[player.id].thiefSteal = { targetId };
      break;
    case 'dentist_silence':
      requireRole(player, 'dentist');
      requireAliveTarget(targetId);
      state.nightActions[player.id].dentistSilence = { targetId };
      break;
    case 'bone_trade':
      requireRole(player, 'boneMerchant');
      if (player.roleState.used) fail(400, 'Bone Merchant power is already used.');
      requireDeadTarget(targetId);
      state.nightActions[player.id].boneTrade = { targetId };
      break;
    case 'prostitute_sleep':
      requireRole(player, 'prostitute');
      requireAliveTarget(targetId);
      if (targetId === player.id) fail(400, 'Choose another player.');
      state.nightActions[player.id].prostituteVisit = { targetId };
      player.roleState.lastTargetId = targetId;
      transferOpenUndertakerRequestsForProstitute(player, getPlayer(targetId));
      break;
    case 'black_cat_visit':
      requireRole(player, 'blackCat');
      if (player.roleState.tries <= 0) fail(400, 'Black Cat has no tries left.');
      requireAliveTarget(targetId);
      if (targetId === player.id) fail(400, 'Choose another player.');
      state.nightActions[player.id].blackCatVisit = { targetId };
      break;
    case 'werewolf_hunter_shoot':
      requireRole(player, 'werewolfHunter');
      if (!player.roleState.canShoot) fail(400, 'Werewolf Hunter ability is already lost.');
      requireAliveTarget(targetId);
      state.nightActions[player.id].werewolfHunterShoot = { targetId };
      break;
    case 'hero_guard':
      requireRole(player, 'hero');
      requireAliveTarget(targetId);
      if (targetId === player.id) fail(400, 'Hero sacrifice must protect another player.');
      state.nightActions[player.id].heroGuard = { targetId };
      break;
    case 'healer_revive':
      requireRole(player, 'healer');
      if (player.roleState.used) fail(400, 'Healer power is already used.');
      requireDeadTarget(targetId);
      state.nightActions[player.id].healerRevive = { targetId };
      break;
    case 'lawyer_accuse':
      requireRole(player, 'lawyer');
      if (player.roleState.used) fail(400, 'Lawyer power is already used.');
      requireAliveTarget(targetId);
      state.nightActions[player.id].lawyerAccuse = { targetId };
      break;
    case 'undertaker_ask':
      requireRole(player, 'undertaker');
      if (state.nightActions[player.id].undertakerAsk) fail(400, 'Undertaker request is already sent tonight.');
      {
        const target = requireAnyTarget(targetId);
        if (target.id === player.id) fail(400, 'Choose another player.');
        createUndertakerRequest(player, target);
      }
      state.nightActions[player.id].undertakerAsk = { targetId };
      break;
    case 'blacksmith_give':
      requireRole(player, 'blacksmith');
      if (player.roleState.used) fail(400, 'Blacksmith power is already used.');
      requireAliveTarget(targetId);
      state.nightActions[player.id].blacksmithGive = { targetId };
      break;
    case 'sword_strike':
      if (!player.items.sword || player.items.swordUsed) fail(400, 'You do not have an unused sword.');
      requireAliveTarget(targetId);
      state.nightActions[player.id].swordStrike = { targetId };
      break;
    case 'werewolf_vote':
      if (!isWolfRole(player.role)) fail(403, 'Only Werewolves can vote for the night kill.');
      requireAliveTarget(targetId);
      state.werewolfVotes[player.id] = targetId;
      break;
    case 'black_infect':
      requireRole(player, 'blackWerewolf');
      if (player.roleState.infectUsed) fail(400, 'Infection is already used.');
      requireAliveTarget(targetId);
      if (isWolfRole(getPlayer(targetId).role)) fail(400, 'Target is already a Werewolf.');
      state.nightActions[player.id].blackInfect = { targetId };
      break;
    case 'alpha_kill':
      requireRole(player, 'alphaWerewolf');
      if (!player.roleState.alphaKillActive) fail(400, 'Alpha extra kill is no longer active.');
      requireAliveTarget(targetId);
      state.nightActions[player.id].alphaKill = { targetId };
      break;
    default:
      fail(400, 'Unknown action.');
  }
  addAdmin(`${player.name} submitted ${action}.`);
  if (state.players.some((candidate) => candidate.isBot)) runNightBots();
  else maybeAutoResolveNight();
}

function requireRole(player, role) {
  if (player.role !== role) fail(403, `Only ${roleName(role)} can do that.`);
}

function requireAliveTarget(targetId) {
  const target = getPlayer(targetId);
  if (!target || !target.alive) fail(400, 'Choose a living player.');
  return target;
}

function requireDeadTarget(targetId) {
  const target = getPlayer(targetId);
  if (!target || target.alive) fail(400, 'Choose a dead player.');
  return target;
}

function requireAnyTarget(targetId) {
  const target = getPlayer(targetId);
  if (!target) fail(400, 'Choose a player.');
  return target;
}

function makeProstituteRedirects() {
  const redirects = new Map();
  for (const actor of livingPlayers().filter((player) => player.role === 'prostitute')) {
    const action = getNightAction(actor, 'prostituteVisit');
    const target = getPlayer(action?.targetId);
    if (!target || !target.alive || target.id === actor.id) continue;
    redirects.set(actor.id, target.id);
    redirects.set(target.id, actor.id);
  }
  return redirects;
}

function transferOpenUndertakerRequestsForProstitute(prostitute, partner) {
  if (!prostitute || !partner) return;
  const redirects = new Map([[prostitute.id, partner.id], [partner.id, prostitute.id]]);
  for (const request of state.undertakerRequests.filter((item) => (
    item.night === state.night && !item.answer && !item.skippedAt && redirects.has(item.targetId)
  ))) {
    const oldTarget = getPlayer(request.targetId);
    const newTarget = getPlayer(redirects.get(request.targetId));
    if (!newTarget) continue;
    request.targetId = newTarget.id;
    addPrivate(newTarget.id, 'The Undertaker requests your help tonight. Send one word or note of up to 10 characters.');
    addAdmin(`Prostitute redirected an Undertaker request from ${oldTarget?.name || 'unknown'} to ${newTarget.name}.`);
  }
}

function createUndertakerRequest(actor, target) {
  const redirects = makeProstituteRedirects();
  const redirectedTarget = getPlayer(redirects.get(target.id)) || target;
  state.undertakerRequests = state.undertakerRequests.filter((request) => !(
    request.night === state.night && request.undertakerId === actor.id && !request.answer && !request.skippedAt
  ));

  if (redirectedTarget.alive && redirectedTarget.role === 'frostWidow' && !redirectedTarget.status.resurrected) {
    addPrivate(actor.id, `You asked ${redirectedTarget.name} for a note, but no answer reached you.`);
    return null;
  }

  const request = {
    id: randomId('undertaker'),
    undertakerId: actor.id,
    targetId: redirectedTarget.id,
    night: state.night,
    createdAt: Date.now(),
    answer: null,
    skippedAt: null
  };
  state.undertakerRequests.push(request);
  addPrivate(actor.id, `You asked ${redirectedTarget.name} for a note of up to 10 characters.`);
  addPrivate(redirectedTarget.id, 'The Undertaker requests your help tonight. Send one word or note of up to 10 characters.');
  return request;
}

function answerUndertaker(player, body, skip = false) {
  const request = state.undertakerRequests.find((candidate) => (
    candidate.id === body.requestId &&
    candidate.targetId === player.id &&
    candidate.night === state.night &&
    !candidate.answer &&
    !candidate.skippedAt
  ));
  if (!request) fail(400, 'No open Undertaker request.');
  if (skip) {
    request.skippedAt = Date.now();
    addPrivate(request.undertakerId, `${player.name} gave no answer to your Undertaker request.`);
    addPrivate(player.id, 'You gave no answer to the Undertaker.');
    addAdmin(`${player.name} skipped an Undertaker request for ${getPlayer(request.undertakerId)?.name || 'unknown'}.`);
    return;
  }
  const answer = cleanText(body.answer, 10);
  if (!answer) fail(400, 'Answer cannot be empty.');
  request.answer = answer;
  request.answeredAt = Date.now();
  addPrivate(request.undertakerId, `Undertaker note from ${player.name}: "${answer}".`);
  addPrivate(player.id, `You sent the Undertaker: "${answer}".`);
  addAdmin(`${player.name} answered Undertaker request for ${getPlayer(request.undertakerId)?.name || 'unknown'}.`);
}

function getNightAction(player, key) {
  return state.nightActions[player.id]?.[key] || null;
}

function actionCanceled(ctx, player, key) {
  return ctx.canceled.has(`${player.id}:${key}`);
}

function resolveNight() {
  if (state.phase !== 'night') fail(400, 'Night is not active.');
  if (state.paused) return;
  clearTimers();
  const ctx = {
    protections: new Map(),
    heroGuards: new Map(),
    canceled: new Set(),
    prostituteRedirects: new Map(),
    lawyerCases: []
  };

  applyProstituteSwaps(ctx);
  applyFrostWidow(ctx);
  resolveHeroGuards(ctx);
  resolveGuardian(ctx);
  resolveSword(ctx);
  resolveBlacksmith(ctx);
  resolveWerewolfHunter(ctx);
  resolveLawyer(ctx);
  resolveDentist(ctx);
  resolveWitch(ctx);
  resolveSeer(ctx);
  resolveThief(ctx);
  resolveBlackCat(ctx);
  resolveUndertaker(ctx);
  resolveHealer(ctx);
  resolveBoneMerchant(ctx);
  resolveWerewolves(ctx);
  applyLawyerCases(ctx);

  if (checkWin()) return;
  if (state.reactionQueue.length > 0) {
    beginReaction('night');
    return;
  }
  beginDayAfterNight();
}

function collectTargetingActions() {
  const keys = [
    'guardianProtect', 'swordStrike', 'blacksmithGive', 'werewolfHunterShoot',
    'lawyerAccuse', 'dentistSilence', 'witchHeal', 'witchKill', 'seerCheck',
    'thiefSteal', 'blackCatVisit', 'undertakerAsk', 'heroGuard', 'blackInfect', 'alphaKill'
  ];
  const actions = [];
  for (const [actorId, playerActions] of Object.entries(state.nightActions)) {
    for (const key of keys) {
      if (playerActions[key]?.targetId) actions.push({ actorId, key, targetId: playerActions[key].targetId });
    }
  }
  return actions;
}

function applyProstituteSwaps(ctx) {
  ctx.prostituteRedirects = makeProstituteRedirects();
  if (ctx.prostituteRedirects.size === 0) return;

  for (const actor of livingPlayers().filter((player) => player.role === 'prostitute')) {
    const partner = getPlayer(getNightAction(actor, 'prostituteVisit')?.targetId);
    if (partner?.alive) addPrivate(actor.id, `You slept with ${partner.name}. Night effects between you are swapped.`);
  }

  for (const action of collectTargetingActions()) {
    const nextTargetId = ctx.prostituteRedirects.get(action.targetId);
    if (!nextTargetId || nextTargetId === action.targetId) continue;
    const playerActions = state.nightActions[action.actorId];
    if (!playerActions?.[action.key]) continue;
    const oldTarget = getPlayer(action.targetId);
    const newTarget = getPlayer(nextTargetId);
    playerActions[action.key].targetId = nextTargetId;
    addAdmin(`Prostitute redirected ${action.key} from ${oldTarget?.name || 'unknown'} to ${newTarget?.name || 'unknown'}.`);
  }

  for (const [wolfId, targetId] of Object.entries(state.werewolfVotes)) {
    const nextTargetId = ctx.prostituteRedirects.get(targetId);
    if (!nextTargetId || nextTargetId === targetId) continue;
    const oldTarget = getPlayer(targetId);
    const newTarget = getPlayer(nextTargetId);
    state.werewolfVotes[wolfId] = nextTargetId;
    addAdmin(`Prostitute redirected a Werewolf target from ${oldTarget?.name || 'unknown'} to ${newTarget?.name || 'unknown'}.`);
  }

  for (const request of state.undertakerRequests.filter((item) => item.night === state.night && !item.answer && !item.skippedAt)) {
    const nextTargetId = ctx.prostituteRedirects.get(request.targetId);
    if (!nextTargetId || nextTargetId === request.targetId) continue;
    const oldTarget = getPlayer(request.targetId);
    const newTarget = getPlayer(nextTargetId);
    request.targetId = nextTargetId;
    if (newTarget) addPrivate(newTarget.id, 'The Undertaker requests your help tonight. Send one word or note of up to 10 characters.');
    addAdmin(`Prostitute redirected an Undertaker request from ${oldTarget?.name || 'unknown'} to ${newTarget?.name || 'unknown'}.`);
  }
}

function applyFrostWidow(ctx) {
  for (const action of collectTargetingActions()) {
    const actor = getPlayer(action.actorId);
    const target = getPlayer(action.targetId);
    if (!actor || !target || !actor.alive || !target.alive) continue;
    if (target.role !== 'frostWidow' || target.status.resurrected) continue;
    ctx.canceled.add(`${actor.id}:${action.key}`);
    stripPower(actor, `targeting Frost Widow ${target.name}`);
    addAdmin(`${actor.name}'s ${action.key} was frozen by ${target.name}.`);
  }
}

function addProtection(ctx, targetId, label) {
  if (!ctx.protections.has(targetId)) ctx.protections.set(targetId, []);
  ctx.protections.get(targetId).push(label);
}

function resolveHeroGuards(ctx) {
  for (const actor of livingPlayers().filter((player) => player.role === 'hero')) {
    const action = getNightAction(actor, 'heroGuard');
    if (!action || actionCanceled(ctx, actor, 'heroGuard')) continue;
    const target = getPlayer(action.targetId);
    if (!target || !target.alive || target.id === actor.id) continue;
    ctx.heroGuards.set(actor.id, target.id);
    addPrivate(actor.id, `You are ready to sacrifice yourself for ${target.name}.`);
  }
}

function resolveGuardian(ctx) {
  for (const actor of livingPlayers().filter((player) => player.role === 'guardian')) {
    const action = getNightAction(actor, 'guardianProtect');
    if (!action || actionCanceled(ctx, actor, 'guardianProtect')) continue;
    const target = getPlayer(action.targetId);
    if (!target || !target.alive) continue;
    if (target.id === actor.id && actor.roleState.selfUsed) continue;
    if (target.id === actor.roleState.lastTargetId) continue;
    addProtection(ctx, target.id, `Guardian ${actor.name}`);
    actor.roleState.lastTargetId = target.id;
    if (target.id === actor.id) actor.roleState.selfUsed = true;
    addPrivate(actor.id, `You protected ${target.name}.`);
  }
}

function resolveSword(ctx) {
  for (const actor of livingPlayers().filter((player) => player.items.sword && !player.items.swordUsed)) {
    const action = getNightAction(actor, 'swordStrike');
    if (!action || actionCanceled(ctx, actor, 'swordStrike')) continue;
    const target = getPlayer(action.targetId);
    if (!target || !target.alive) continue;
    actor.items.sword = false;
    actor.items.swordUsed = true;
    addPrivate(actor.id, `You used the sword on ${target.name}.`);
    attemptKill(target, 'struck by a forged sword', 'ability', ctx);
  }
}

function resolveBlacksmith(ctx) {
  for (const actor of livingPlayers().filter((player) => player.role === 'blacksmith')) {
    const action = getNightAction(actor, 'blacksmithGive');
    if (!action || actor.roleState.used || actionCanceled(ctx, actor, 'blacksmithGive')) continue;
    const target = getPlayer(action.targetId);
    if (!target || !target.alive) continue;
    target.items.sword = true;
    target.items.swordUsed = false;
    actor.roleState.used = true;
    addPrivate(actor.id, `You forged a sword for ${target.name}.`);
    addPrivate(target.id, 'The Blacksmith gave you a sword. You may use it once on a future night.');
  }
}

function resolveWerewolfHunter(ctx) {
  for (const actor of livingPlayers().filter((player) => player.role === 'werewolfHunter')) {
    const action = getNightAction(actor, 'werewolfHunterShoot');
    if (!action || !actor.roleState.canShoot || actionCanceled(ctx, actor, 'werewolfHunterShoot')) continue;
    const target = getPlayer(action.targetId);
    if (!target || !target.alive) continue;
    const targetWasWolf = isWolfRole(target.role);
    attemptKill(target, 'shot by the Werewolf Hunter', 'ability', ctx);
    if (targetWasWolf) {
      addPrivate(actor.id, `${target.name} was a Werewolf. You keep your ability.`);
    } else {
      actor.roleState.canShoot = false;
      addPrivate(actor.id, `${target.name} was not a Werewolf. You lose your shooting ability.`);
    }
  }
}

function resolveLawyer(ctx) {
  for (const actor of livingPlayers().filter((player) => player.role === 'lawyer')) {
    const action = getNightAction(actor, 'lawyerAccuse');
    if (!action || actor.roleState.used || actionCanceled(ctx, actor, 'lawyerAccuse')) continue;
    const target = getPlayer(action.targetId);
    if (!target || !target.alive) continue;
    actor.roleState.used = true;
    ctx.lawyerCases.push({ lawyerId: actor.id, targetId: target.id });
    addPrivate(actor.id, `Your evidence against ${target.name} is sealed until dawn. Survive the night.`);
  }
}

function resolveDentist(ctx) {
  for (const actor of livingPlayers().filter((player) => player.role === 'dentist')) {
    const action = getNightAction(actor, 'dentistSilence');
    if (!action || actionCanceled(ctx, actor, 'dentistSilence')) continue;
    const target = getPlayer(action.targetId);
    if (!target || !target.alive) continue;
    target.status.nextSilenced = true;
    addPrivate(actor.id, `${target.name} will be silenced tomorrow.`);
  }
}

function resolveWitch(ctx) {
  for (const actor of livingPlayers().filter((player) => player.role === 'witch')) {
    const heal = getNightAction(actor, 'witchHeal');
    if (heal && actor.roleState.healPotion && !actionCanceled(ctx, actor, 'witchHeal')) {
      const target = getPlayer(heal.targetId);
      if (target && target.alive) {
        addProtection(ctx, target.id, `Witch healing potion from ${actor.name}`);
        actor.roleState.healPotion = false;
        addPrivate(actor.id, `You used the healing potion on ${target.name}.`);
      }
    }
    const kill = getNightAction(actor, 'witchKill');
    if (kill && actor.roleState.killPotion && !actionCanceled(ctx, actor, 'witchKill')) {
      const target = getPlayer(kill.targetId);
      if (target && target.alive) {
        actor.roleState.killPotion = false;
        addPrivate(actor.id, `You used the killing potion on ${target.name}.`);
        attemptKill(target, 'killed by the Witch', 'ability', ctx);
      }
    }
  }
}

function resolveSeer(ctx) {
  for (const actor of livingPlayers().filter((player) => player.role === 'seer' || player.role === 'shamanOracle')) {
    const action = getNightAction(actor, 'seerCheck');
    if (!action || actionCanceled(ctx, actor, 'seerCheck')) continue;
    const target = getPlayer(action.targetId);
    if (!target) continue;
    if (actor.role === 'shamanOracle') {
      addPrivate(actor.id, `Shaman Oracle result: ${target.name} is ${roleNameWithArticle(target.role)}.`);
    } else {
      addPrivate(actor.id, `Seer result: ${target.name} ${isWolfRole(target.role) ? 'is' : 'is not'} a Werewolf.`);
    }
  }
}

function resolveThief(ctx) {
  for (const actor of livingPlayers().filter((player) => player.role === 'thief')) {
    const action = getNightAction(actor, 'thiefSteal');
    if (!action || actor.roleState.used || actionCanceled(ctx, actor, 'thiefSteal')) continue;
    const target = getPlayer(action.targetId);
    if (!target || !target.alive || target.id === actor.id) continue;
    const stolenRole = target.role;
    setRole(actor, stolenRole);
    setRole(target, 'villager');
    addPrivate(actor.id, `You stole ${target.name}'s role and became ${roleName(stolenRole)}.`);
    addPrivate(target.id, 'The Thief stole your role. You are now a Villager.');
    addAdmin(`${actor.name} stole ${target.name}'s role.`);
  }
}

function resolveBlackCat(ctx) {
  for (const actor of livingPlayers().filter((player) => player.role === 'blackCat')) {
    const action = getNightAction(actor, 'blackCatVisit');
    if (!action || actor.roleState.tries <= 0 || actionCanceled(ctx, actor, 'blackCatVisit')) continue;
    const target = getPlayer(action.targetId);
    if (!target || !target.alive || target.id === actor.id) continue;
    if (isWolfRole(target.role)) {
      addPrivate(actor.id, `${target.name} was a Werewolf. The Black Cat clash is fatal.`);
      attemptKill(target, 'caught by the Black Cat', 'ability', ctx);
      attemptKill(actor, 'died in a Black Cat clash', 'ability', ctx);
    } else {
      actor.roleState.tries -= 1;
      addPrivate(actor.id, `${target.name} was not a Werewolf. Black Cat tries left: ${actor.roleState.tries}.`);
      if (actor.roleState.tries <= 0) addPrivate(actor.id, 'Your Black Cat ability is now exhausted.');
    }
  }
}

function resolveUndertaker(ctx) {
  for (const actor of livingPlayers().filter((player) => player.role === 'undertaker')) {
    const action = getNightAction(actor, 'undertakerAsk');
    if (!action) continue;
    if (actionCanceled(ctx, actor, 'undertakerAsk')) {
      const request = state.undertakerRequests.find((candidate) => (
        candidate.night === state.night && candidate.undertakerId === actor.id && candidate.targetId === action.targetId
      ));
      if (request && !request.answer && !request.skippedAt) request.skippedAt = Date.now();
      continue;
    }
    const target = getPlayer(action.targetId);
    if (!target || target.id === actor.id) continue;
  }
}

function resolveHealer(ctx) {
  for (const actor of livingPlayers().filter((player) => player.role === 'healer')) {
    const action = getNightAction(actor, 'healerRevive');
    if (!action || actor.roleState.used || actionCanceled(ctx, actor, 'healerRevive')) continue;
    const target = getPlayer(action.targetId);
    if (!target || target.alive) continue;
    actor.roleState.used = true;
    target.alive = true;
    target.status.deadAt = null;
    target.status.deathCause = null;
    target.status.silenced = false;
    target.status.nextSilenced = false;
    target.status.resurrected = true;
    target.status.moonCursedNext = false;
    if (target.role === 'deadman') target.roleState.awake = false;
    addPublic(`${target.name} returned from the dead.`);
    addPrivate(actor.id, `You revived ${target.name}.`);
    addPrivate(target.id, 'The Healer returned you to life.');
  }
}

function resolveBoneMerchant(ctx) {
  for (const actor of livingPlayers().filter((player) => player.role === 'boneMerchant')) {
    const action = getNightAction(actor, 'boneTrade');
    if (!action || actor.roleState.used || actionCanceled(ctx, actor, 'boneTrade')) continue;
    const target = getPlayer(action.targetId);
    if (!target || target.alive) continue;
    const deadRole = target.role;
    const deadState = clone(target.roleState);
    target.role = 'boneMerchant';
    target.team = roleDef(target.role).team;
    target.roleState = { used: true };
    actor.role = deadRole;
    actor.team = roleDef(deadRole).team;
    actor.roleState = deadState;
    addPrivate(actor.id, `You traded with ${target.name} and became ${roleName(deadRole)}.`);
    addAdmin(`${actor.name} traded roles with dead player ${target.name}.`);
  }
}

function resolveWerewolves(ctx) {
  const wolvesBeforeInfection = livingPlayers().filter((player) => isWolfRole(player.role));
  for (const actor of wolvesBeforeInfection.filter((player) => player.role === 'blackWerewolf')) {
    const action = getNightAction(actor, 'blackInfect');
    if (!action || actor.roleState.infectUsed || actionCanceled(ctx, actor, 'blackInfect')) continue;
    const target = getPlayer(action.targetId);
    if (!target || !target.alive || isWolfRole(target.role)) continue;
    setRole(target, 'werewolf');
    actor.roleState.infectUsed = true;
    addPrivate(actor.id, `${target.name} has been infected and is now a normal Werewolf.`);
    addPrivate(target.id, 'You were infected by the Black Werewolf. You are now a normal Werewolf.');
    addAdmin(`${actor.name} infected ${target.name}.`);
  }

  const livingWolvesAtKill = wolvesBeforeInfection.filter((player) => player.alive && isWolfRole(player.role));
  const agreedTargetId = getAgreedWerewolfTarget(livingWolvesAtKill);
  if (livingWolvesAtKill.length > 0 && agreedTargetId) {
    const target = getPlayer(agreedTargetId);
    if (target && target.alive && !isWolfRole(target.role)) attemptKill(target, 'killed by the Werewolves', 'werewolf', ctx);
  } else if (livingWolvesAtKill.length > 0) {
    addAdmin('Werewolves did not agree on a living target. No shared Werewolf kill happened.');
  }

  for (const actor of livingWolvesAtKill.filter((player) => player.role === 'alphaWerewolf')) {
    const action = getNightAction(actor, 'alphaKill');
    if (!action || !actor.roleState.alphaKillActive || actionCanceled(ctx, actor, 'alphaKill')) continue;
    const target = getPlayer(action.targetId);
    if (!target || !target.alive || isWolfRole(target.role)) continue;
    attemptKill(target, 'killed by the Alpha Werewolf', 'werewolf', ctx);
  }
}

function getAgreedWerewolfTarget(wolves) {
  const livingWolves = wolves.filter((player) => player && player.alive && isWolfRole(player.role));
  if (livingWolves.length === 0) return null;
  const votes = livingWolves.map((wolf) => state.werewolfVotes[wolf.id]).filter(Boolean);
  if (votes.length !== livingWolves.length) return null;
  const unique = [...new Set(votes)];
  return unique.length === 1 ? unique[0] : null;
}

function getWitchWerewolfVictim() {
  const targetId = getAgreedWerewolfTarget(livingPlayers().filter((player) => isWolfRole(player.role)));
  const target = getPlayer(targetId);
  if (!target || !target.alive || isWolfRole(target.role)) return null;
  return target;
}

function witchWaitingForWerewolves(player) {
  return Boolean(
    state.phase === 'night' &&
    player?.role === 'witch' &&
    player.roleState.healPotion &&
    livingPlayers().some((candidate) => isWolfRole(candidate.role)) &&
    !getWitchWerewolfVictim()
  );
}

function availableNightActions(player) {
  if (!player || !player.alive) return [];
  const actions = [];
    switch (player.role) {
      case 'seer':
      case 'shamanOracle':
        actions.push('seerCheck');
        break;
    case 'witch':
      if (player.roleState.healPotion && getWitchWerewolfVictim()) actions.push('witchHeal');
      if (player.roleState.killPotion) actions.push('witchKill');
      break;
    case 'guardian':
      actions.push('guardianProtect');
      break;
    case 'thief':
      if (!player.roleState.used) actions.push('thiefSteal');
      break;
    case 'dentist':
      actions.push('dentistSilence');
      break;
    case 'boneMerchant':
      if (!player.roleState.used && state.players.some((target) => !target.alive)) actions.push('boneTrade');
      break;
    case 'prostitute':
      if (livingPlayers().some((target) => target.id !== player.id)) actions.push('prostituteVisit');
      break;
    case 'blackCat':
      if (player.roleState.tries > 0) actions.push('blackCatVisit');
      break;
    case 'werewolfHunter':
      if (player.roleState.canShoot) actions.push('werewolfHunterShoot');
      break;
    case 'hero':
      actions.push('heroGuard');
      break;
    case 'healer':
      if (!player.roleState.used && state.players.some((target) => !target.alive)) actions.push('healerRevive');
      break;
    case 'lawyer':
      if (!player.roleState.used) actions.push('lawyerAccuse');
      break;
    case 'undertaker':
      if (state.players.some((target) => target.id !== player.id)) actions.push('undertakerAsk');
      break;
    case 'blacksmith':
      if (!player.roleState.used) actions.push('blacksmithGive');
      break;
    case 'blackWerewolf':
      if (!player.roleState.infectUsed) actions.push('blackInfect');
      break;
    case 'alphaWerewolf':
      if (player.roleState.alphaKillActive) actions.push('alphaKill');
      break;
    default:
      break;
  }
  if (player.items.sword && !player.items.swordUsed) actions.push('swordStrike');
  return actions;
}

function needsNightChoice(player) {
  if (player?.role === 'witch' && witchWaitingForWerewolves(player)) return true;
  return availableNightActions(player).length > 0;
}

function isNightChoiceDone(player) {
  if (player?.role === 'witch' && witchWaitingForWerewolves(player)) return false;
  if (!needsNightChoice(player)) return true;
  const actions = state.nightActions[player.id] || {};
  if (actions.skipRole) return true;
  if (player.role === 'witch') {
    if (actions.witchDone) return true;
    return availableNightActions(player).every((key) => Boolean(actions[key]));
  }
  return availableNightActions(player).some((key) => Boolean(actions[key]));
}

function werewolvesReady() {
  const wolves = livingPlayers().filter((player) => isWolfRole(player.role));
  if (wolves.length === 0) return true;
  return Boolean(getAgreedWerewolfTarget(wolves));
}

function undertakerRequestsReady() {
  return state.undertakerRequests
    .filter((request) => request.night === state.night)
    .every((request) => request.answer || request.skippedAt || !getPlayer(request.targetId));
}

function maybeAutoResolveNight() {
  if (state.paused) return;
  if (state.phase !== 'night') return;
  if (!livingPlayers().every(isNightChoiceDone)) return;
  if (!undertakerRequestsReady()) return;
  if (!werewolvesReady()) return;
  resolveNight();
}

function randomChoice(items) {
  if (!items.length) return null;
  return items[randomInt(items.length)];
}

function botUndertakerAnswer() {
  return randomChoice(['wolf', 'safe', 'north', 'liar', 'quiet', 'danger', 'watch', 'trust']);
}

function botActionBucket(player) {
  if (!state.nightActions[player.id]) state.nightActions[player.id] = {};
  return state.nightActions[player.id];
}

function botAliveTargets(excludeId = null) {
  return livingPlayers().filter((player) => player.id !== excludeId);
}

function runNightBots() {
  if (state.paused || state.phase !== 'night') return;
  for (const bot of livingPlayers().filter((player) => player.isBot)) {
    chooseBotRoleAction(bot);
  }
  chooseBotWerewolfVotes();
  for (const bot of livingPlayers().filter((player) => player.isBot && player.role === 'witch')) {
    chooseBotRoleAction(bot);
  }
  answerBotUndertakerRequests();
  maybeAutoResolveNight();
}

function answerBotUndertakerRequests() {
  for (const request of state.undertakerRequests.filter((item) => item.night === state.night && !item.answer && !item.skippedAt)) {
    const target = getPlayer(request.targetId);
    if (!target?.isBot) continue;
    const answer = botUndertakerAnswer();
    request.answer = answer;
    request.answeredAt = Date.now();
    addPrivate(request.undertakerId, `Undertaker note from ${target.name}: "${answer}".`);
    addPrivate(target.id, `You sent the Undertaker: "${answer}".`);
    addAdmin(`${target.name} answered Undertaker request for ${getPlayer(request.undertakerId)?.name || 'unknown'}.`);
  }
}

function chooseBotRoleAction(bot) {
  const actions = botActionBucket(bot);
  if (actions.skipRole || (bot.role === 'witch' ? isNightChoiceDone(bot) : availableNightActions(bot).some((key) => actions[key]))) return;
  const alive = botAliveTargets();
  const others = botAliveTargets(bot.id);
  const dead = state.players.filter((player) => !player.alive);
  const witchVictim = bot.role === 'witch' ? getWitchWerewolfVictim() : null;
  const chance = (percent) => randomInt(100) < percent;
  const setTarget = (key, targets) => {
    if (actions[key]) return;
    const target = randomChoice(targets);
    if (target) actions[key] = { targetId: target.id, bot: true };
  };

    switch (bot.role) {
      case 'seer':
      case 'shamanOracle':
        setTarget('seerCheck', others);
        break;
    case 'witch':
      if (bot.roleState.healPotion && witchVictim && chance(55)) setTarget('witchHeal', [witchVictim]);
      if (bot.roleState.killPotion && chance(25)) setTarget('witchKill', others);
      break;
    case 'guardian':
      setTarget('guardianProtect', alive.filter((target) => (
        target.id !== bot.roleState.lastTargetId &&
        !(target.id === bot.id && bot.roleState.selfUsed)
      )));
      break;
    case 'thief':
      if (!bot.roleState.used && chance(35)) setTarget('thiefSteal', others);
      break;
    case 'dentist':
      setTarget('dentistSilence', others);
      break;
    case 'boneMerchant':
      if (!bot.roleState.used && dead.length && chance(40)) setTarget('boneTrade', dead);
      break;
    case 'prostitute':
      setTarget('prostituteVisit', others);
      break;
    case 'blackCat':
      if (bot.roleState.tries > 0 && chance(55)) setTarget('blackCatVisit', others);
      break;
    case 'werewolfHunter':
      if (bot.roleState.canShoot && chance(45)) setTarget('werewolfHunterShoot', others);
      break;
    case 'hero':
      setTarget('heroGuard', others);
      break;
    case 'healer':
      if (!bot.roleState.used && dead.length && chance(45)) setTarget('healerRevive', dead);
      break;
    case 'lawyer':
      if (!bot.roleState.used && chance(45)) setTarget('lawyerAccuse', others);
      break;
    case 'undertaker':
      if (chance(60)) {
        const target = randomChoice(state.players.filter((player) => player.id !== bot.id));
        if (target) {
          actions.undertakerAsk = { targetId: target.id, bot: true };
          createUndertakerRequest(bot, target);
        }
      }
      break;
    case 'blacksmith':
      if (!bot.roleState.used && chance(45)) setTarget('blacksmithGive', alive);
      break;
    default:
      break;
  }

  if (bot.items.sword && !bot.items.swordUsed && chance(35)) {
    setTarget('swordStrike', others);
  }

  if (bot.role === 'blackWerewolf' && !bot.roleState.infectUsed && chance(30)) {
    setTarget('blackInfect', alive.filter((target) => !isWolfRole(target.role)));
  }
  if (bot.role === 'alphaWerewolf' && bot.roleState.alphaKillActive) {
    setTarget('alphaKill', alive.filter((target) => !isWolfRole(target.role)));
  }

  if (bot.role === 'witch' && witchWaitingForWerewolves(bot)) return;
  if (needsNightChoice(bot) && !isNightChoiceDone(bot)) {
    actions.skipRole = { at: Date.now(), bot: true };
  }
}

function chooseBotWerewolfVotes() {
  const wolves = livingPlayers().filter((player) => isWolfRole(player.role));
  const botWolves = wolves.filter((player) => player.isBot);
  if (botWolves.length === 0) return;
  const targets = livingPlayers().filter((player) => !isWolfRole(player.role));
  if (targets.length === 0) return;
  const humanVotes = wolves
    .filter((player) => !player.isBot)
    .map((player) => state.werewolfVotes[player.id])
    .filter(Boolean);
  const uniqueHumanVotes = [...new Set(humanVotes)];
  const targetId = uniqueHumanVotes.length === 1 ? uniqueHumanVotes[0] : randomChoice(targets).id;
  for (const wolf of botWolves) {
    state.werewolfVotes[wolf.id] = targetId;
  }
}

function scheduleDayBots() {
  if (state.paused || state.phase !== 'day' || state.dayResolved || !dayVotingOpen()) return;
  setBotTimer(() => runDayBots(), 3500);
}

function runDayBots() {
  if (state.paused || state.phase !== 'day' || state.dayResolved || !dayVotingOpen()) return;
  for (const bot of activeVoters().filter((player) => player.isBot)) {
    if (state.dayVotes[bot.id]) continue;
    const targets = livingPlayers().filter((target) => target.id !== bot.id);
    if (targets.length === 0 || randomInt(100) < 12) {
      state.dayVotes[bot.id] = 'neutral';
      continue;
    }
    const botIsWolf = isWolfRole(bot.role);
    const preferredTargets = targets.filter((target) => botIsWolf ? !isWolfRole(target.role) : target.id !== bot.id);
    state.dayVotes[bot.id] = randomChoice(preferredTargets.length ? preferredTargets : targets).id;
  }
  addAdmin('Bots submitted day votes.');
  maybeAutoResolveDay();
}

function scheduleReactionBot() {
  if (state.paused || state.phase !== 'reaction' || !state.currentReaction) return;
  const actor = getPlayer(state.currentReaction.actorId);
  if (!actor?.isBot) return;
  setBotTimer(() => {
    if (state.phase !== 'reaction' || !state.currentReaction || state.currentReaction.actorId !== actor.id) return;
    if (state.currentReaction.type === 'flowerChild') {
      state.currentReaction.choice = randomInt(100) < 65 ? 'save' : 'skip';
      resolveCurrentReaction(state.currentReaction.choice === 'skip');
      return;
    }
    const target = randomChoice(livingPlayers());
    state.currentReaction.choice = target && randomInt(100) < 75 ? target.id : 'skip';
    resolveCurrentReaction(state.currentReaction.choice === 'skip');
  }, 1200);
}

function applyLawyerCases(ctx) {
  for (const lawyerCase of ctx.lawyerCases) {
    const lawyer = getPlayer(lawyerCase.lawyerId);
    const target = getPlayer(lawyerCase.targetId);
    if (!lawyer || !lawyer.alive || !target || !target.alive) continue;
    const unsafe = isWolfRole(target.role);
    addPrivate(lawyer.id, unsafe
      ? `Evidence opened: ${target.name} was a werewolf. Case dismissed.`
      : `Evidence opened: ${target.name} was safe. Case dismissed.`);
    if (target.role === 'werewolf') {
      killPlayer(target, 'exposed by the Lawyer', 'ability');
    } else if (target.role === 'blackWerewolf' || target.role === 'alphaWerewolf') {
      setRole(target, 'werewolf');
      addPrivate(target.id, 'The Lawyer exposed your special Werewolf power. You are now a normal Werewolf.');
      addAdmin(`${target.name} was reduced to a normal Werewolf by Lawyer evidence.`);
    } else if (isPoweredRole(target.role)) {
      stripPower(target, 'Lawyer evidence');
      addAdmin(`${target.name}'s power was removed by Lawyer evidence.`);
    }
  }
}

function attemptKill(target, cause, type, ctx = { protections: new Map(), heroGuards: new Map() }) {
  if (!target || !target.alive) return { killed: false, saved: false };
  if (type !== 'vote') {
    const protections = ctx.protections?.get(target.id) || [];
    if (protections.length > 0) {
      addAdmin(`${target.name} survived ${cause}; protected by ${protections.join(', ')}.`);
      return { killed: false, saved: true };
    }
    if (type === 'werewolf' && target.role === 'moonCursed' && !target.status.resurrected) {
      target.status.moonCursedNext = true;
      addPrivate(target.id, 'The Werewolves attacked you. The moon curse will take hold next night.');
      addAdmin(`${target.name} was attacked and marked for Moon-Cursed conversion.`);
      return { killed: false, saved: true };
    }
    if (type === 'werewolf' && target.role === 'cook') {
      addPrivate(target.id, 'The Werewolves tried to kill you, but the Cook cannot be killed by Werewolves.');
      addAdmin(`${target.name} survived Werewolves as Cook.`);
      return { killed: false, saved: true };
    }
    if (type === 'werewolf' && target.role === 'wise' && target.roleState.wolfSurvival) {
      target.roleState.wolfSurvival = false;
      addPrivate(target.id, 'The Werewolves attacked you. Your Wise survival was used.');
      addAdmin(`${target.name} survived Werewolves as Wise.`);
      return { killed: false, saved: true };
    }
    if (target.role === 'hero' && target.roleState.shield) {
      target.roleState.shield = false;
      addPrivate(target.id, `You survived an attack: ${cause}. Your Hero shield is now gone.`);
      addAdmin(`${target.name} survived ${cause} with Hero shield.`);
      return { killed: false, saved: true };
    }
    const hero = findHeroGuarding(target.id, ctx);
    if (hero) {
      killPlayer(hero, `sacrificed to save ${target.name}`, 'ability');
      addPrivate(hero.id, `You sacrificed yourself to save ${target.name}.`);
      addPrivate(target.id, `${hero.name} sacrificed themselves to save you.`);
      return { killed: false, saved: true };
    }
  }
  killPlayer(target, cause, type);
  return { killed: true, saved: false };
}

function findHeroGuarding(targetId, ctx) {
  for (const [heroId, guardedId] of ctx.heroGuards || []) {
    const hero = getPlayer(heroId);
    if (guardedId === targetId && hero && hero.alive && hero.role === 'hero') return hero;
  }
  return null;
}

function killPlayer(player, cause, type) {
  if (!player || !player.alive) return;
  player.alive = false;
  player.status.deadAt = Date.now();
  player.status.deathCause = cause;
  player.status.silenced = false;
  player.status.nextSilenced = false;
  addAdmin(`${player.name} died: ${cause}. Role was ${roleName(player.role)}.`);
  if (state.phase === 'night' || (state.phase === 'reaction' && state.reactionContext === 'night')) {
    state.lastNightDeaths.push({ playerId: player.id, name: player.name, cause });
  }
  if (player.role === 'deadman') {
    player.roleState.awake = true;
    addPrivate(player.id, 'You are dead, but Deadman is awake. You may discuss and vote during the day.');
  }
  if (player.role === 'graveBloom') triggerGraveBloom(player);
  if (player.role === 'hunter' && !player.status.hunterTriggered) {
    player.status.hunterTriggered = true;
    queueReaction(player, 'hunter');
  }
  if (type === 'vote' && player.role === 'assassin') queueReaction(player, 'assassin');
}

function queueReaction(player, type, data = {}) {
  state.reactionQueue.push({ id: randomId('reaction'), actorId: player.id, type, choice: null, deadline: null, ...data });
}

function beginReaction(context) {
  clearTimers();
  state.phase = 'reaction';
  state.reactionContext = context;
  state.phaseStartedAt = Date.now();
  state.actionDeadline = null;
  state.currentReaction = state.reactionQueue.shift();
  state.currentReaction.deadline = null;
  addPublic('A hidden choice is resolving.');
  scheduleCurrentReactionTimeout();
}

function scheduleCurrentReactionTimeout() {
  if (state.paused || state.phase !== 'reaction' || !state.currentReaction) return;
  scheduleReactionBot();
}

function submitReaction(player, targetId) {
  if (state.phase !== 'reaction' || !state.currentReaction) fail(400, 'No reaction is waiting.');
  if (state.paused) fail(400, 'Game is paused.');
  if (state.currentReaction.actorId !== player.id) fail(403, 'This reaction is not yours.');
  if (state.currentReaction.type === 'flowerChild') {
    if (targetId !== 'save' && targetId !== 'skip') fail(400, 'Choose save or skip.');
  } else if (targetId !== 'skip') {
    requireAliveTarget(targetId);
  }
  state.currentReaction.choice = targetId;
  resolveCurrentReaction();
}

function resolveCurrentReaction(skip = false) {
  if (state.phase !== 'reaction' || !state.currentReaction) fail(400, 'No reaction is waiting.');
  clearTimers();
  const reaction = state.currentReaction;
  const actor = getPlayer(reaction.actorId);
  const choice = skip ? 'skip' : reaction.choice;
  if (reaction.type === 'flowerChild') {
    resolveFlowerChildReaction(actor, choice);
    return;
  }
  if (choice && choice !== 'skip') {
    const target = getPlayer(choice);
    if (target && target.alive) {
      addPublic('A hidden choice was used.');
      attemptKill(target, `eliminated by ${reaction.type === 'hunter' ? 'the Hunter' : 'the Assassin'}`, 'ability');
    }
  } else {
    addPublic('A hidden choice was skipped.');
  }
  state.currentReaction = null;
  if (checkWin()) return;
  if (state.reactionQueue.length > 0) {
    beginReaction(state.reactionContext);
    return;
  }
  const context = state.reactionContext;
  state.reactionContext = null;
  if (context === 'night') beginDayAfterNight();
  else finishDayResolved();
}

function resolveFlowerChildReaction(actor, choice) {
  const reaction = state.currentReaction;
  const target = getPlayer(reaction.targetId || state.pendingBanishment?.targetId);
  state.currentReaction = null;
  if (choice === 'save' && actor && actor.role === 'flowerChild' && !actor.roleState.used && target?.alive) {
    actor.roleState.used = true;
    addPublic('The vote failed. Nobody is banished.');
    addPrivate(actor.id, 'You used your Flower Child power.');
    state.pendingBanishment = null;
    state.reactionContext = null;
    if (checkWin()) return;
    finishDayResolved();
    return;
  }

  state.pendingBanishment = null;
  state.reactionContext = null;
  if (!target || !target.alive) finishDayWithoutBanish('The vote target is no longer alive. Nobody is banished.');
  else completeBanishment(target);
}

function triggerGraveBloom(source) {
  const candidates = livingPlayers().filter((player) => (
    player.id !== source.id && (isPoweredRole(player.role) || player.items.sword)
  ));
  if (candidates.length === 0) return;
  const target = candidates[randomInt(candidates.length)];
  stripPower(target, 'Gravebloom');
  addPublic('A hidden power withered another hidden power.');
}

function stripPower(player, reason) {
  if (!player) return false;
  const oldRole = player.role;
  let changed = false;
  if (player.role === 'blackWerewolf' || player.role === 'alphaWerewolf') {
    setRole(player, 'werewolf');
    changed = true;
  } else if (player.role !== 'villager' && player.role !== 'werewolf') {
    setRole(player, 'villager');
    player.status.lostPowerName = roleName(oldRole);
    changed = true;
  }
  if (player.items.sword) {
    player.items.sword = false;
    player.items.swordUsed = true;
    changed = true;
  }
  if (changed) {
    addPrivate(player.id, `Your power was lost because of ${reason}. You are now ${roleName(player.role)}.`);
    addAdmin(`${player.name} lost ${roleName(oldRole)} because of ${reason}.`);
  }
  return changed;
}

function stripVillagePowers() {
  for (const player of livingPlayers()) {
    if (roleDef(player.role).team === 'village' && player.role !== 'villager') {
      stripPower(player, 'the Wise was banished');
    }
  }
}

function beginDayAfterNight() {
  state.phase = 'day';
  state.phaseStartedAt = Date.now();
  state.actionDeadline = Date.now() + DAY_DISCUSSION_MS;
  state.day += 1;
  state.dayResolved = false;
  state.dayVotes = {};
  const stillDead = state.lastNightDeaths
    .map((death) => getPlayer(death.playerId))
    .filter((player) => player && !player.alive);
  if (stillDead.length === 0) addPublic('Dawn breaks. Nobody died tonight.');
  else addPublic(`Dawn breaks. Dead tonight: ${stillDead.map((player) => player.name).join(', ')}.`);

  const silenced = [];
  for (const player of livingPlayers()) {
    if (player.status.nextSilenced) {
      player.status.silenced = true;
      player.status.nextSilenced = false;
      silenced.push(player.name);
    }
  }
  if (silenced.length > 0) addPublic(`${silenced.join(', ')} cannot speak during today's discussion.`);
  addPublic(`Day ${state.day} begins. Discuss for 3 minutes, then vote.`);
  if (!checkWin()) scheduleDayVotingOpen();
}

function scheduleDayVotingOpen() {
  if (state.paused || state.phase !== 'day' || state.dayResolved || state.winner) return;
  const remaining = state.actionDeadline ? state.actionDeadline - Date.now() : 0;
  if (remaining > 0) {
    setAutoTimer(() => {
      if (state.phase !== 'day' || state.dayResolved || state.paused || state.winner) return;
      addPublic('Voting is open.');
      scheduleDayBots();
    }, remaining);
    return;
  }
  scheduleDayBots();
}

function jesterCanStillBeVotedOut(alive) {
  if (!alive.some((player) => player.role === 'jester')) return false;
  const livingNonJesterVillagers = alive.filter((player) => (
    player.role !== 'jester' && !isWolfRole(player.role)
  ));
  return livingNonJesterVillagers.length >= 2;
}

function checkWin() {
  if (state.winner || state.phase === 'lobby') return Boolean(state.winner);
  const alive = livingPlayers();
  const wolves = alive.filter((player) => isWolfRole(player.role));
  const nonWolves = alive.filter((player) => !isWolfRole(player.role));
  if (wolves.length === 0) {
    if (jesterCanStillBeVotedOut(alive)) {
      const message = 'A secret win condition is still active. The village must continue carefully.';
      if (state.publicLog[0]?.text !== message) addPublic(message);
      return false;
    }
    endGame('village', 'All Werewolves are gone. The village wins.');
    return true;
  }
  if (nonWolves.length <= 1) {
    endGame('werewolves', nonWolves.length === 0
      ? 'No villagers remain. The Werewolves win.'
      : 'Only one player remains against the Werewolves. The Werewolves win.');
    return true;
  }
  return false;
}

function endGame(winner, message) {
  clearTimers();
  state.phase = 'ended';
  state.winner = { winner, message, at: Date.now() };
  state.actionDeadline = null;
  state.dayResolved = true;
  state.pendingBanishment = null;
  addPublic(message);
}

function removePlayer(playerId) {
  if (state.phase !== 'lobby') fail(400, 'Players can only be removed in the lobby.');
  const player = getPlayer(playerId);
  if (!player) fail(404, 'Player not found.');
  state.players = state.players.filter((candidate) => candidate.id !== playerId);
  delete state.privateLog[playerId];
  addAdmin(`${player.name} was removed from the lobby.`);
}

function kickPlayer(playerId) {
  const player = getPlayer(playerId);
  if (!player) fail(404, 'Player not found.');
  state.players = state.players.filter((candidate) => candidate.id !== playerId);
  delete state.privateLog[playerId];
  delete state.dayVotes[playerId];
  delete state.nightActions[playerId];
  delete state.werewolfVotes[playerId];
  for (const voterId of Object.keys(state.dayVotes)) {
    if (state.dayVotes[voterId] === playerId) delete state.dayVotes[voterId];
  }
  for (const wolfId of Object.keys(state.werewolfVotes)) {
    if (state.werewolfVotes[wolfId] === playerId) delete state.werewolfVotes[wolfId];
  }
  state.undertakerRequests = state.undertakerRequests.filter((request) => request.targetId !== playerId && request.undertakerId !== playerId);
  state.reactionQueue = state.reactionQueue.filter((reaction) => reaction.actorId !== playerId);
  const kickedCurrentReaction = state.currentReaction?.actorId === playerId;
  if (kickedCurrentReaction) state.currentReaction = null;
  addPublic(`${player.name} was kicked by debug tools.`);
  addAdmin(`${player.name} was kicked.`);

  if (state.phase === 'lobby') {
    maybeAutoStartLobby();
    return;
  }
  if (checkWin()) return;
  if (kickedCurrentReaction) {
    const context = state.reactionContext;
    if (state.reactionQueue.length > 0) beginReaction(context);
    else {
      state.reactionContext = null;
      if (context === 'night') beginDayAfterNight();
      else finishDayResolved();
    }
    return;
  }
  if (state.phase === 'day') maybeAutoResolveDay();
  if (state.phase === 'night') maybeAutoResolveNight();
}

function joinPlayer(body) {
  const name = cleanText(body.name, 24);
  if (!name) fail(400, 'Name is required.');
  const existing = getPlayerByToken(body.token);
  if (existing && !body.forceNew) {
    const duplicate = state.players.find((player) => player.id !== existing.id && player.name.toLowerCase() === name.toLowerCase());
    if (duplicate) fail(400, 'Another player already uses that name.');
    existing.name = name;
    if (state.phase === 'lobby') existing.ready = false;
    existing.lastSeen = Date.now();
    return existing;
  }
  if (state.phase !== 'lobby') fail(400, 'New players can only join during the lobby.');
  if (state.players.length >= MAX_PLAYERS) fail(400, 'Lobby is full.');
  if (state.players.some((player) => player.name.toLowerCase() === name.toLowerCase())) fail(400, 'Another player already uses that name.');

  const player = createPlayer(name, false);
  state.players.push(player);
  addPublic(`${player.name} joined the lobby.`);
  return player;
}

function createPlayer(name, isBot) {
  const player = {
    id: randomId('player'),
    token: randomId('token'),
    name,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
    isBot: Boolean(isBot),
    ready: false,
    preferredRole: null,
    alive: true,
    role: 'villager',
    roleState: {},
    team: 'village',
    items: { sword: false, swordUsed: false },
    status: {
      silenced: false,
      nextSilenced: false,
      deadAt: null,
      deathCause: null,
      resurrected: false,
      moonCursedNext: false,
      hunterTriggered: false,
      lostPowerName: null
    }
  };
  return player;
}

function setPlayerReady(player, ready) {
  if (state.phase !== 'lobby') fail(400, 'Ready is only used in the lobby.');
  player.ready = Boolean(ready);
  player.lastSeen = Date.now();
  addPublic(`${player.name} is ${player.ready ? 'ready' : 'not ready'}.`);
  maybeAutoStartLobby();
}

function maybeAutoStartLobby() {
  if (state.paused) return;
  if (state.phase !== 'lobby') return;
  if (state.players.length < MIN_PLAYERS) return;
  if (!state.players.every((player) => player.ready)) return;
  startGame();
}

function addBots(count) {
  if (state.phase !== 'lobby') fail(400, 'Bots can only be added in the lobby.');
  const requested = Math.floor(Number(count) || 0);
  if (requested <= 0) return;
  const amount = Math.min(requested, MAX_PLAYERS - state.players.length);
  if (amount <= 0) fail(400, 'Lobby is already full.');
  for (let i = 0; i < amount; i += 1) {
    state.botCounter += 1;
    const bot = createPlayer(`Bot ${state.botCounter}`, true);
    state.players.push(bot);
  }
  addPublic(`${amount} bot${amount === 1 ? '' : 's'} joined the lobby.`);
}

function clearBots() {
  if (state.phase !== 'lobby') fail(400, 'Bots can only be cleared in the lobby.');
  const before = state.players.length;
  state.players = state.players.filter((player) => !player.isBot);
  addPublic(`${before - state.players.length} bot${before - state.players.length === 1 ? '' : 's'} removed.`);
}

function readyAllForTest(playerToken) {
  if (state.phase !== 'lobby') fail(400, 'Ready all is only available in the lobby.');
  const human = getPlayerByToken(playerToken);
  for (const player of state.players) {
    if (player.isBot || (human && player.id === human.id)) player.ready = true;
  }
  addPublic('Test players are ready.');
  maybeAutoStartLobby();
}

function setPreferredRole(playerId, roleKey) {
  if (state.phase !== 'lobby') fail(400, 'Roles can only be forced before the game starts.');
  const player = getPlayer(playerId);
  if (!player) fail(404, 'Player not found.');
  const role = String(roleKey || '');
  player.preferredRole = role && ROLE_DEFS[role] ? role : null;
  addPublic(player.preferredRole ? `${player.name} has a test role selected.` : `${player.name}'s test role was cleared.`);
}

function debugReset() {
  clearTimers();
  state = freshState();
  addPublic('Fresh lobby created.');
}

function debugOpenVoting() {
  if (state.phase !== 'day' || state.dayResolved) fail(400, 'Voting can only be opened during an unresolved day.');
  state.actionDeadline = Date.now();
  clearAutoTimer();
  addPublic('Voting is open.');
  if (!state.paused) scheduleDayBots();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new HttpError(413, 'Request body is too large.'));
    });
    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new HttpError(400, 'Invalid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, phase: state.phase });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/state') {
    sendJson(res, 200, makeSnapshot(Object.fromEntries(url.searchParams.entries())));
    return;
  }
  if (req.method !== 'POST') fail(405, 'Method not allowed.');
  const body = await readBody(req);
  let result = { ok: true };
  switch (url.pathname) {
    case '/api/player/join': {
      const player = joinPlayer(body);
      result = { ok: true, token: player.token, playerId: player.id };
      break;
    }
    case '/api/player/ready': {
      const player = getPlayerByToken(body.token);
      if (!player) fail(401, 'Player session not found.');
      setPlayerReady(player, body.ready !== false);
      break;
    }
    case '/api/player/vote': {
      const player = getPlayerByToken(body.token);
      if (!player) fail(401, 'Player session not found.');
      player.lastSeen = Date.now();
      submitVote(player, body.targetId);
      break;
    }
    case '/api/player/night-action': {
      const player = getPlayerByToken(body.token);
      if (!player) fail(401, 'Player session not found.');
      player.lastSeen = Date.now();
      submitNightAction(player, body);
      break;
    }
    case '/api/player/reaction': {
      const player = getPlayerByToken(body.token);
      if (!player) fail(401, 'Player session not found.');
      player.lastSeen = Date.now();
      submitReaction(player, body.targetId);
      break;
    }
    case '/api/debug/add-bots':
      addBots(body.count);
      break;
    case '/api/debug/clear-bots':
      clearBots();
      break;
    case '/api/debug/ready-all':
      readyAllForTest(body.token);
      break;
    case '/api/debug/set-role':
      setPreferredRole(String(body.playerId || ''), body.roleKey);
      break;
    case '/api/debug/kick':
      kickPlayer(String(body.playerId || ''));
      break;
    case '/api/debug/pause':
      setPaused(body.paused !== false);
      break;
    case '/api/debug/open-voting':
      debugOpenVoting();
      break;
    case '/api/debug/reset':
      debugReset();
      break;
    case '/api/game/reset':
      {
        const player = getPlayerByToken(body.token);
        if (!player) fail(401, 'Player session not found.');
        if (!canResetEndedGame(player)) fail(403, 'Only the first joined player can reset after the game ends.');
      }
      clearTimers();
      state = freshState();
      addPublic('Fresh lobby created.');
      break;
    default:
      fail(404, 'API route not found.');
  }
  sendJson(res, 200, result);
}

function serveStatic(req, res, url) {
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const safePath = path.normalize(requested).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'content-type': MIME_TYPES[ext] || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : 'Server error.';
    if (!(error instanceof HttpError)) console.error(error);
    sendJson(res, status, { ok: false, error: message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Mafia host running on http://0.0.0.0:${PORT}`);
});
