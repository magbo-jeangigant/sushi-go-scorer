const MAX_PLAYERS = 5;
const MIN_PLAYERS = 2;
const TOTAL_ROUNDS = 3;

const cardFields = [
  { key: "maki1", label: "1 Maki Roll", help: "1 icon each" },
  { key: "maki2", label: "2 Maki Rolls", help: "2 icons each" },
  { key: "maki3", label: "3 Maki Rolls", help: "3 icons each" },
  { key: "tempura", label: "Tempura", help: "2 cards = 5" },
  { key: "sashimi", label: "Sashimi", help: "3 cards = 10" },
  { key: "dumpling", label: "Dumplings", help: "1/3/6/10/15" },
  { key: "squid", label: "Squid Nigiri", help: "3 points" },
  { key: "salmon", label: "Salmon Nigiri", help: "2 points" },
  { key: "egg", label: "Egg Nigiri", help: "1 point" },
  { key: "squidWasabi", label: "Squid on Wasabi", help: "9 points" },
  { key: "salmonWasabi", label: "Salmon on Wasabi", help: "6 points" },
  { key: "eggWasabi", label: "Egg on Wasabi", help: "3 points" },
  { key: "chopsticks", label: "Chopsticks", help: "0 points" }
];

const state = {
  players: [],
  currentRound: 1,
  lastRoundResult: null,
  puddingResult: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const screens = {
  setup: $("#setup-screen"),
  round: $("#round-screen"),
  standings: $("#standings-screen"),
  pudding: $("#pudding-screen"),
  final: $("#final-screen")
};

function showScreen(name) {
  Object.values(screens).forEach(screen => screen.classList.remove("active"));
  screens[name].classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function blankRoundCards() {
  return Object.fromEntries(cardFields.map(field => [field.key, 0]));
}

function addPlayer(name = "") {
  if ($$(".player-name-row").length >= MAX_PLAYERS) return;

  const list = $("#player-list");
  const row = document.createElement("div");
  row.className = "player-name-row";
  row.innerHTML = `
    <input type="text" maxlength="24" placeholder="Player ${list.children.length + 1}" value="${escapeHtml(name)}" />
    <button class="remove-player" type="button" aria-label="Remove player">×</button>
  `;
  row.querySelector(".remove-player").addEventListener("click", () => {
    if ($$(".player-name-row").length > MIN_PLAYERS) {
      row.remove();
      refreshPlaceholders();
    }
  });
  list.appendChild(row);
}

function refreshPlaceholders() {
  $$("#player-list input").forEach((input, index) => {
    input.placeholder = `Player ${index + 1}`;
  });
}

function startGame() {
  const names = $$("#player-list input").map((input, index) => input.value.trim() || `Player ${index + 1}`);
  const uniqueNames = new Set(names.map(name => name.toLowerCase()));

  if (names.length < MIN_PLAYERS || names.length > MAX_PLAYERS) {
    $("#setup-error").textContent = "Add between 2 and 5 players.";
    return;
  }
  if (uniqueNames.size !== names.length) {
    $("#setup-error").textContent = "Please use unique player names.";
    return;
  }

  state.players = names.map(name => ({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name,
    total: 0,
    roundScores: [],
    pudding: 0,
    puddingScore: 0
  }));
  state.currentRound = 1;
  state.lastRoundResult = null;
  state.puddingResult = null;
  renderRound();
  showScreen("round");
}

function renderRound() {
  $("#round-number").textContent = state.currentRound;
  const wrapper = $("#round-forms");
  wrapper.innerHTML = "";

  state.players.forEach(player => {
    const card = document.createElement("article");
    card.className = "player-card";
    card.dataset.playerId = player.id;
    card.innerHTML = `
      <div class="player-card-header">
        <h3>${escapeHtml(player.name)}</h3>
        <div class="player-score-chip">${player.total} pts</div>
      </div>
      <div class="counter-grid"></div>
    `;
    const grid = card.querySelector(".counter-grid");
    cardFields.forEach(field => grid.appendChild(createCounter(field.label, field.help, field.key)));
    wrapper.appendChild(card);
  });
}

function createCounter(label, help, key, value = 0) {
  const template = $("#counter-template").content.cloneNode(true);
  const row = template.querySelector(".counter-row");
  const labelEl = template.querySelector(".counter-label");
  const helpEl = template.querySelector(".counter-help");
  const output = template.querySelector(".counter-value");
  const minus = template.querySelector(".minus");
  const plus = template.querySelector(".plus");

  row.dataset.key = key;
  labelEl.textContent = label;
  helpEl.textContent = help;
  output.textContent = value;

  minus.addEventListener("click", () => setCounterValue(output, Number(output.textContent) - 1));
  plus.addEventListener("click", () => setCounterValue(output, Number(output.textContent) + 1));

  return template;
}

function setCounterValue(output, value) {
  output.textContent = Math.max(0, value);
}

function collectRoundInput() {
  const inputsByPlayer = new Map();
  $$("#round-forms .player-card").forEach(card => {
    const cards = blankRoundCards();
    card.querySelectorAll(".counter-row").forEach(row => {
      cards[row.dataset.key] = Number(row.querySelector(".counter-value").textContent);
    });
    inputsByPlayer.set(card.dataset.playerId, cards);
  });
  return inputsByPlayer;
}

function scoreRound() {
  const inputs = collectRoundInput();
  const details = state.players.map(player => {
    const cards = inputs.get(player.id);
    const baseScore = scoreNonMakiCards(cards);
    const makiIcons = cards.maki1 + cards.maki2 * 2 + cards.maki3 * 3;
    return {
      playerId: player.id,
      name: player.name,
      cards,
      makiIcons,
      tempura: Math.floor(cards.tempura / 2) * 5,
      sashimi: Math.floor(cards.sashimi / 3) * 10,
      dumpling: scoreDumplings(cards.dumpling),
      nigiri: scoreNigiri(cards),
      maki: 0,
      roundTotal: baseScore
    };
  });

  applyMakiScoring(details);

  details.forEach(detail => {
    detail.roundTotal += detail.maki;
    const player = state.players.find(p => p.id === detail.playerId);
    player.total += detail.roundTotal;
    player.roundScores.push(detail.roundTotal);
  });

  state.lastRoundResult = { round: state.currentRound, details };
  renderStandings();
  showScreen("standings");
}

function scoreNonMakiCards(cards) {
  return Math.floor(cards.tempura / 2) * 5 +
    Math.floor(cards.sashimi / 3) * 10 +
    scoreDumplings(cards.dumpling) +
    scoreNigiri(cards);
}

function scoreDumplings(count) {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 3;
  if (count === 3) return 6;
  if (count === 4) return 10;
  return 15;
}

function scoreNigiri(cards) {
  return cards.squid * 3 + cards.salmon * 2 + cards.egg +
    cards.squidWasabi * 9 + cards.salmonWasabi * 6 + cards.eggWasabi * 3;
}

function applyMakiScoring(details) {
  const positiveScores = [...new Set(details.map(d => d.makiIcons).filter(score => score > 0))].sort((a, b) => b - a);
  if (positiveScores.length === 0) return;

  const firstScore = positiveScores[0];
  const firstGroup = details.filter(d => d.makiIcons === firstScore);
  const firstPoints = Math.floor(6 / firstGroup.length);
  firstGroup.forEach(d => d.maki += firstPoints);

  if (firstGroup.length > 1 || positiveScores.length < 2) return;

  const secondScore = positiveScores[1];
  const secondGroup = details.filter(d => d.makiIcons === secondScore);
  const secondPoints = Math.floor(3 / secondGroup.length);
  secondGroup.forEach(d => d.maki += secondPoints);
}

function renderStandings() {
  $("#standings-title").textContent = `After Round ${state.lastRoundResult.round}`;
  $("#round-total-pill").textContent = `Round ${state.lastRoundResult.round} scored`;
  renderStandingsList("#standings-list", state.players);
  renderRoundBreakdown();
  $("#next-step").textContent = state.currentRound < TOTAL_ROUNDS ? "Next Round" : "Enter Puddings";
}

function sortedPlayers(players = state.players) {
  return [...players].sort((a, b) => b.total - a.total || b.pudding - a.pudding || a.name.localeCompare(b.name));
}

function renderStandingsList(selector, players) {
  const wrapper = $(selector);
  wrapper.innerHTML = "";
  sortedPlayers(players).forEach((player, index) => {
    const row = document.createElement("div");
    row.className = "standing-row";
    row.innerHTML = `
      <div class="rank">${index + 1}</div>
      <div>
        <div class="standing-name">${escapeHtml(player.name)}</div>
        <div class="standing-detail">Rounds: ${player.roundScores.join(" / ") || "—"}${player.pudding || player.puddingScore ? ` · Pudding: ${player.pudding} cards (${formatScore(player.puddingScore)})` : ""}</div>
      </div>
      <div class="standing-score">${player.total}</div>
    `;
    wrapper.appendChild(row);
  });
}

function renderRoundBreakdown() {
  const breakdown = $("#round-breakdown");
  const rows = state.lastRoundResult.details.map(d => `
    <tr>
      <td>${escapeHtml(d.name)}</td>
      <td>${d.makiIcons}</td>
      <td>${d.maki}</td>
      <td>${d.tempura}</td>
      <td>${d.sashimi}</td>
      <td>${d.dumpling}</td>
      <td>${d.nigiri}</td>
      <td>${d.roundTotal}</td>
    </tr>
  `).join("");

  breakdown.innerHTML = `
    <h3>Round ${state.lastRoundResult.round} breakdown</h3>
    <table class="breakdown-table">
      <thead>
        <tr>
          <th>Player</th><th>Maki Icons</th><th>Maki Pts</th><th>Tempura</th><th>Sashimi</th><th>Dumplings</th><th>Nigiri</th><th>Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function nextStep() {
  if (state.currentRound < TOTAL_ROUNDS) {
    state.currentRound += 1;
    renderRound();
    showScreen("round");
  } else {
    renderPuddingForms();
    showScreen("pudding");
  }
}

function renderPuddingForms() {
  const wrapper = $("#pudding-forms");
  wrapper.innerHTML = "";
  state.players.forEach(player => {
    const card = document.createElement("article");
    card.className = "player-card";
    card.dataset.playerId = player.id;
    card.innerHTML = `
      <div class="player-card-header">
        <h3>${escapeHtml(player.name)}</h3>
        <div class="player-score-chip">${player.total} pts</div>
      </div>
      <div class="counter-grid one-col"></div>
    `;
    card.querySelector(".counter-grid").appendChild(createCounter("Pudding", "Scored at game end", "pudding"));
    wrapper.appendChild(card);
  });
}

function scorePudding() {
  $$("#pudding-forms .player-card").forEach(card => {
    const player = state.players.find(p => p.id === card.dataset.playerId);
    player.pudding = Number(card.querySelector(".counter-value").textContent);
    player.puddingScore = 0;
  });

  const result = applyPuddingScoring();
  state.puddingResult = result;
  state.players.forEach(player => player.total += player.puddingScore);

  renderFinal();
  showScreen("final");
}

function applyPuddingScoring() {
  const counts = state.players.map(p => p.pudding);
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  const most = state.players.filter(p => p.pudding === max);
  const least = state.players.filter(p => p.pudding === min);

  if (max === min) {
    return { most, least, skipped: true };
  }

  const mostPoints = Math.floor(6 / most.length);
  most.forEach(player => player.puddingScore += mostPoints);

  if (state.players.length > 2) {
    const leastPenalty = Math.floor(6 / least.length);
    least.forEach(player => player.puddingScore -= leastPenalty);
  }

  return { most, least, skipped: false };
}

function renderFinal() {
  renderStandingsList("#final-standings", state.players);
  const winners = determineWinners();
  if (winners.length === 1) {
    $("#winner-title").textContent = `🏆 ${winners[0].name} wins!`;
    $("#winner-subtitle").textContent = `${winners[0].total} points${winners[0].pudding ? ` and ${winners[0].pudding} pudding card${winners[0].pudding === 1 ? "" : "s"}` : ""}.`;
  } else {
    $("#winner-title").textContent = `🏆 Shared victory!`;
    $("#winner-subtitle").textContent = `${winners.map(w => w.name).join(" and ")} are still tied after pudding tie-breakers.`;
  }
  renderPuddingBreakdown();
}

function determineWinners() {
  const bestScore = Math.max(...state.players.map(p => p.total));
  const tied = state.players.filter(p => p.total === bestScore);
  if (tied.length <= 1) return tied;
  const bestPudding = Math.max(...tied.map(p => p.pudding));
  return tied.filter(p => p.pudding === bestPudding);
}

function renderPuddingBreakdown() {
  const rows = state.players.map(player => `
    <tr><td>${escapeHtml(player.name)}</td><td>${player.pudding}</td><td>${formatScore(player.puddingScore)}</td><td>${player.total}</td></tr>
  `).join("");
  const note = state.puddingResult.skipped
    ? "All players tied for pudding, so no pudding points were awarded."
    : state.players.length === 2
      ? "Two-player game: only most-pudding points are awarded; no one loses pudding points."
      : "Most pudding gains 6 split evenly; fewest pudding loses 6 split evenly.";

  $("#pudding-breakdown").innerHTML = `
    <h3>Pudding breakdown</h3>
    <p>${note}</p>
    <table class="breakdown-table">
      <thead><tr><th>Player</th><th>Puddings</th><th>Pudding Pts</th><th>Final</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function resetGame() {
  state.players = [];
  state.currentRound = 1;
  state.lastRoundResult = null;
  state.puddingResult = null;
  $("#player-list").innerHTML = "";
  addPlayer();
  addPlayer();
  $("#setup-error").textContent = "";
  showScreen("setup");
}

function formatScore(score) {
  return score > 0 ? `+${score}` : `${score}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

$("#add-player").addEventListener("click", () => addPlayer());
$("#start-game").addEventListener("click", startGame);
$("#score-round").addEventListener("click", scoreRound);
$("#next-step").addEventListener("click", nextStep);
$("#score-pudding").addEventListener("click", scorePudding);
$("#reset-game").addEventListener("click", resetGame);
$("#play-again").addEventListener("click", resetGame);

resetGame();
