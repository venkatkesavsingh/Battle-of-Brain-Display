/********************************
 * IMPORTS
 ********************************/
import { db } from "./firebase.js";
import {
  ref,
  onValue,
  get
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

/********************************
 * DOM ELEMENTS
 ********************************/
const teamInfoPanel = document.getElementById("teamInfoPanel");
const statusText = document.getElementById("statusText");
const needle = document.getElementById("needle");

// Average box
const avgBox = document.getElementById("avgBox");
const avgValue = document.getElementById("avgValue");

// X value box
const xBox = document.getElementById("xBox");
const xCalcValue = document.getElementById("xCalcValue");

/********************************
 * LOCAL STATE
 ********************************/
let teamCards = {};
let animationRunning = false;

/********************************
 * TEAM CARDS (ALWAYS VISIBLE)
 ********************************/
onValue(ref(db, "teams"), snap => {
  if (!snap.exists()) return;

  teamInfoPanel.innerHTML = "";
  teamCards = {};

  snap.forEach(child => {
    const team = child.val();
    const id = child.key;

    const card = document.createElement("div");
    card.className = "team-card-info";

    if (team.disqualified) card.classList.add("team-out");

    card.innerHTML = `
      <div class="team-card-content">
        <div class="team-id">${id}</div>
        <div class="team-score">${team.score ?? 0}</div>
        <div class="team-pick" id="pick-${id}">PICK: --</div>
      </div>
    `;

    teamCards[id] = card;
    teamInfoPanel.appendChild(card);
  });
});

/********************************
 * ROUND STATE
 ********************************/
onValue(ref(db, "Admin/roundState"), snap => {
  const state = snap.val();

  if (state === "RUNNING") {
    resetDisplay();
    statusText.innerText = "ROUND IN PROGRESS";
  }

  if (state === "ENDED") {
    statusText.innerText = "CALCULATING...";
  }
});

/********************************
 * TIMER → START DISPLAY FLOW
 ********************************/
onValue(ref(db, "Admin/timer"), async snap => {
  if (snap.val() !== 0 || animationRunning) return;
  animationRunning = true;

  const teamsSnap = await get(ref(db, "teams"));
  if (!teamsSnap.exists()) return;

  const teams = teamsSnap.val();

  /******** PHASE 1 — SHOW PICKS ********/
  Object.keys(teams).forEach(id => {
    const pickEl = document.getElementById(`pick-${id}`);
    if (pickEl) {
      pickEl.innerText = `PICK: ${teams[id].selectedValue ?? "--"}`;
      pickEl.classList.add("show");
    }
  });

  // ===============================
  // MASS DUPLICATE CHECK (> 2 teams)
  // ===============================
  const pickCounts = {};

  Object.values(teams).forEach(t => {
    if (typeof t.selectedValue === "number") {
      pickCounts[t.selectedValue] = (pickCounts[t.selectedValue] || 0) + 1;
    }
  });

  // Trigger ONLY if 3 or more teams picked same number
  const hasMassDuplicate = Object.values(pickCounts).some(count => count > 2);

  if (hasMassDuplicate) {
    // 🚨 RULE TRIGGERED
    statusText.innerText = "MASS DUPLICATE SELECTION";

    avgBox.classList.add("show");
    avgValue.innerText = "—";

    xBox.classList.add("show");
    xCalcValue.innerText = "NO WINNER";

    return;
  }

  const values = Object.values(teams)
    .map(t => t.selectedValue)
    .filter(v => typeof v === "number");

  if (!values.length) return;

  /******** PHASE 2 — SHOW AVERAGE ********/
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  avgValue.innerText = avg.toFixed(2);
  avgBox.classList.add("show");

  /******** PHASE 3 — WAIT 3 SECONDS ********/
  setTimeout(() => {

    /******** PHASE 4 — SHOW X VALUE ********/
    const X = +(avg * 0.8).toFixed(2);
    xCalcValue.innerText = X.toFixed(2);
    xBox.classList.add("show");

    // Needle shake → settle
    needle.style.transform =
      `translateX(calc(-50% + ${(Math.random() * 40 - 20)}px))`;

    setTimeout(() => {
      needle.style.transform = "translateX(-50%)";

      /******** PHASE 5 — HIGHLIGHT WINNER(S) ********/
      let minDiff = Infinity;
      Object.values(teams).forEach(t => {
        minDiff = Math.min(minDiff, Math.abs(t.selectedValue - X));
      });

      Object.keys(teams).forEach(id => {
        const t = teams[id];
        const card = teamCards[id];

        if (Math.abs(t.selectedValue - X) === minDiff) {
          card.classList.add("team-highlight");
        }
      });

      statusText.innerText = "RESULTS CONFIRMED";

    }, 1200);

  }, 3000); // ⏱ 3-second gap
});

/********************************
 * RESET FOR NEXT ROUND
 ********************************/
function resetDisplay() {
  animationRunning = false;

  xCalcValue.innerText = "--";

  avgBox.classList.remove("show");
  xBox.classList.remove("show");

  avgValue.innerText = "--";
  xCalcValue.innerText = "--";

  Object.values(teamCards).forEach(card => {
    card.classList.remove("team-highlight");

    const pick = card.querySelector(".team-pick");
    if (pick) {
      pick.innerText = "PICK: --";
      pick.classList.remove("show");
    }
  });
}
