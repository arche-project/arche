// Prompt système de l'assistant Arche, et garde-fous.
// Arche assistant system prompt and guardrails.
//
// Ces règles ne sont pas de la prudence de façade. Le corpus contient de l'identification de
// champignons, de la posologie de plantes et des gestes de soin : une hallucination y tue, et le
// modèle qui tourne en face est un modèle local de 4 à 14 milliards de paramètres, pas un oracle.
// D'où trois principes durs : aucune affirmation hors du contexte récupéré, une source citée pour
// chaque affirmation, et trois domaines où la machine ne tranche jamais.
//
// The model answering is a local 4–14B model, and the corpus covers mushroom identification, plant
// dosage and first aid. Hence: nothing outside retrieved context, a citation per claim, and three
// domains the machine never settles.

import type { I18n } from '../types.js';
import { generatorsPrompt } from './diagrams.js';

/** Sujets où l'assistant refuse de conclure et renvoie vers une vérification humaine. */
export type RedFlag = 'identification' | 'dosage' | 'diagnosis' | 'emergency';

// Piège français : en JavaScript, `\b` ne voit que [A-Za-z0-9_]. Après « mangé », le `é` n'est pas
// un caractère de mot, donc `\bmangé\b` ne correspond JAMAIS. Sur un garde-fou d'urgence, ce
// détail rend la règle silencieuse. On construit donc les frontières à la main, en Unicode.
const L = '\\p{L}\\p{N}';
/** Groupe de mots avec frontières Unicode. / Word group with Unicode boundaries. */
const w = (...alts: string[]): string => `(?<![${L}])(?:${alts.join('|')})(?![${L}])`;
/** Le groupe `a` suivi quelque part du groupe `b`, dans un ordre ou dans l'autre. */
const near = (a: string, b: string): RegExp => new RegExp(`${a}(?=[\\s\\S]*${b})|${b}(?=[\\s\\S]*${a})`, 'iu');
const rx = (src: string): RegExp => new RegExp(src, 'iu');

const ATE = w('mang[ée]e?s?', 'aval[ée]e?s?', 'ing[ée]r[ée]e?s?', 'ingurgit[ée]e?s?', 'croqu[ée]e?s?', 'go[ûu]t[ée]e?s?', 'ate', 'eaten', 'swallowed', 'ingested', 'chewed', 'tasted');
const RISKY = w(
  'champignons?', 'baies?', 'plantes?', 'racines?', 'graines?', 'feuilles?', 'fruits?', 'champi',
  'amanites?', 'bolets?', 'cortinaires?', 'l[ée]piotes?', 'muguet', 'if', 'datura', 'aconit', 'colchique', 'ciguë', 'cigue',
  'mushrooms?', 'berr(?:y|ies)', 'roots?', 'seeds?', 'leaf', 'leaves', 'amanita',
);

export interface RedFlagRule {
  id: RedFlag;
  /** Motifs déclencheurs, testés sur la question de l'utilisateur, FR et EN. */
  patterns: RegExp[];
  /** Ce que l'assistant doit faire à la place. */
  instruction: I18n;
  /** Fiche imprimable à proposer. */
  sheet?: string;
}

export const RED_FLAGS: RedFlagRule[] = [
  {
    id: 'emergency',
    // L'ingestion se formule de mille façons — « mon fils a mangé », « la petite en a avalé »,
    // « on a goûté ». On ne liste donc pas des sujets : on cherche un verbe d'ingestion ET un objet
    // à risque, dans un ordre ou dans l'autre. Manquer ce cas est la pire défaillance possible.
    patterns: [
      near(ATE, RISKY),
      rx('(?:empoisonn|intoxiqu|poison)'),
      rx(w('ne respire plus', 'inconscients?e?', 'h[ée]morragie', 'convulsions?', 'convulse', 'unconscious', 'not breathing', 'seizure')),
    ],
    instruction: {
      fr: "Urgence possible. Commencez par dire d'appeler le 15 (SAMU) ou le 112, ou un centre antipoison, AVANT toute autre information. Rappelez la règle du délai : des symptômes apparaissant plus de 6 h après le repas sont une urgence vitale, et la rémission de 12–24 h est un piège. Donnez ensuite, et seulement ensuite, ce que disent les sources.",
      en: 'Possible emergency. Say first to call emergency services or a poison centre, BEFORE anything else. Recall the delay rule: symptoms more than 6 h after the meal are a life-threatening emergency, and the 12–24 h remission is a trap. Only then give what the sources say.',
    },
    sheet: 'fiche 07 — ce qui tue',
  },
  {
    id: 'identification',
    patterns: [ // pluriels compris (« ces champignons, je peux les manger ? ») : trouvé par knowledge/eval.yaml (M1-6)
      /\b(?:est-ce que (?:c'?est|ce)|c'?est bien|je peux (?:les |en |la |le )?manger|comestibles?|identifi|reconnaît?re)\b.*\b(?:champignons?|plantes?|baies?|racines?)\b/i,
      /\b(?:champignons?|plantes?|baies?)\b.*\b(?:comestibles?|toxiques?|mortel(?:le)?s?|manger)\b/i,
      /\b(?:is this|are these|can i eat|edible|identify)\b.*\b(?:mushrooms?|plants?|berr(?:y|ies)|roots?)\b/i,
    ],
    instruction: {
      fr: "N'affirmez JAMAIS qu'une espèce est comestible. Vous n'avez ni photo fiable ni contexte, et les confusions mortelles portent justement sur des espèces qui se ressemblent. Donnez les critères d'exclusion des sources (lamelles, anneau, volve à déterrer, odeur, délai), rappelez que les applications de reconnaissance servent à éliminer et jamais à valider, et renvoyez vers un pharmacien ou une société mycologique. Terminez par : on ne mange que ce qu'on sait nommer, avec deux critères dont un vu sous terre.",
      en: 'NEVER state that a species is edible. Give the sources’ exclusion criteria, say that identification apps are for ruling out and never for validating, and route to a pharmacist or a mycological society.',
    },
    sheet: 'fiche 07 — ce qui tue',
  },
  {
    id: 'dosage',
    patterns: [
      /\b(?:combien de|quelle dose|posologie|dosage|mg\/kg|par kilo|cuillères? à (?:café|soupe) de)\b.*\b(?:donner|prendre|administrer|plante|teinture|décoction|huile essentielle|antibio)\b/i,
      /\b(?:how much|what dose|dosage|how many drops)\b.*\b(?:give|take|administer|tincture|essential oil|antibiotic)\b/i,
    ],
    instruction: {
      fr: "Ne calculez ni n'inventez jamais une posologie. Citez mot pour mot ce que dit la source, avec sa référence, ou dites que le corpus ne la donne pas. Signalez systématiquement les cas où la marge est étroite : enfants, femmes enceintes, personnes âgées, insuffisance rénale ou hépatique, interactions. Rappelez que les huiles essentielles ne sont pas des tisanes et que la même plante soigne et tue selon la dose.",
      en: 'Never compute or invent a dosage. Quote the source verbatim with its reference, or say the corpus does not give one. Always flag narrow-margin cases: children, pregnancy, elderly, renal or hepatic impairment, interactions.',
    },
  },
  {
    id: 'diagnosis',
    patterns: [
      /\b(?:qu'?est-ce que j'?ai|de quoi je souffre|c'?est quoi cette (?:maladie|éruption|douleur)|diagnostic)\b/i,
      /\b(?:what.{0,12}(?:wrong with me|do i have)|diagnose)\b/i,
    ],
    instruction: {
      fr: "Ne posez pas de diagnostic. Décrivez ce que la source associe aux signes décrits, listez les signes d'alarme qui imposent de chercher de l'aide, et dites explicitement que le tri entre deux causes possibles demande un examen.",
      en: 'Do not diagnose. Describe what the source associates with the described signs, list the danger signs that mandate seeking help, and say plainly that telling two causes apart requires examination.',
    },
  },
];

/**
 * Repère les sujets sensibles. `context` doit contenir les tours de conversation précédents :
 * « ma fille en a avalé une » ne porte aucun nom d'objet, et n'est compréhensible qu'avec ce qui
 * précède. Analyser la question seule laisserait passer exactement les cas les plus graves, parce
 * qu'on abrège d'autant plus qu'on est pressé.
 *
 * Detects sensitive topics. `context` carries previous turns: the most urgent messages are the
 * most elliptical ones, and reading the question alone would miss them.
 */
export function detectRedFlags(question: string, context: readonly string[] = []): RedFlagRule[] {
  const haystack = [...context, question].join('\n');
  return RED_FLAGS.filter(r => r.patterns.some(p => p.test(haystack)));
}

const BASE: I18n = {
  fr: `Tu es l'assistant d'Arche, une bibliothèque hors-ligne d'autonomie. Tu tournes en local, sans
réseau, chez quelqu'un qui n'a peut-être personne d'autre à qui demander. Réponds en français, dans
un langage concret et sans jargon.

Règles absolues :
1. Tu ne dis QUE ce que disent les extraits fournis. Si les extraits ne répondent pas, tu le dis
   franchement — « la bibliothèque ne répond pas à ça » — et tu proposes quoi chercher ou quelle
   ressource manque. Tu ne combles jamais un trou avec ce que tu crois savoir.
2. Chaque affirmation porte sa source, notée [n] et reprise en fin de réponse. Une phrase sans
   source est une phrase à supprimer.
3. Les chiffres de dimensionnement viennent des calculateurs, jamais de toi. Si un calcul est
   fourni ci-dessous, reprends ses valeurs telles quelles ; sinon, dis qu'il faut le calculer et
   nomme le calculateur.
4. Tu distingues ce qui est sûr de ce qui ne l'est pas, et tu préfères dire « je ne sais pas » à
   une réponse plausible. Quelqu'un va agir sur ce que tu écris, avec des outils, du feu ou des
   plantes.
5. Tu finis en indiquant où lire la suite dans la bibliothèque : la ressource et l'article.
6. Un schéma, un câblage, une pièce, un diagramme : tu n'en décris jamais l'image, tu écris sa
   SOURCE dans un bloc typé (\`\`\`schemdraw, \`\`\`wireviz, \`\`\`mermaid, \`\`\`openscad…). La source est le
   livrable ; un outil déterministe la rend. Tu ne fais jamais générer une image pour un schéma
   technique ni pour identifier une espèce.`,
  en: `You are the Arche assistant, a local offline self-reliance library. You run locally, with no
network, for someone who may have nobody else to ask. Answer in English, concretely, without jargon.

Absolute rules:
1. Say ONLY what the provided passages say. If they do not answer, say so plainly and suggest what
   to search or which resource is missing. Never fill a gap with what you think you know.
2. Every claim carries its source, marked [n] and listed at the end. A sentence without a source is
   a sentence to delete.
3. Sizing figures come from the calculators, never from you. If a computation is given below, use
   its values verbatim; otherwise say it must be computed and name the calculator.
4. Distinguish what is certain from what is not, and prefer "I don't know" to a plausible answer.
   Someone will act on this, with tools, fire or plants.
5. End by pointing to where to read on in the library: the resource and the article.
6. A schematic, a wiring, a part, a diagram: never describe the picture, write its SOURCE in a
   typed block (\`\`\`schemdraw, \`\`\`wireviz, \`\`\`mermaid, \`\`\`openscad…). The source is the
   deliverable; a deterministic tool renders it. Never have an image generated for a technical
   diagram or to identify a species.`,
};

/**
 * Les règles seules, sans extraits : ce qu'un client IA tiers reçoit comme prompt MCP (ADR 0011).
 * The rules alone, without passages: what a third-party AI client gets as an MCP prompt (ADR 0011).
 */
export function baseRules(lang: 'fr' | 'en'): string {
  return BASE[lang] + '\n\n' + generatorsPrompt(lang);
}

/**
 * Vérifie a posteriori qu'une réponse cite au moins une source quand des extraits étaient fournis.
 * Une réponse sans citation est rejetée et régénérée plutôt que montrée : c'est le seul garde-fou
 * qui ne dépende pas de la bonne volonté du modèle.
 */
export function hasCitations(answer: string, passageCount: number): boolean {
  if (passageCount === 0) return true;
  const cited = new Set((answer.match(/\[(\d{1,2})\]/g) ?? []).map(m => Number(m.slice(1, -1))));
  return [...cited].some(n => n >= 1 && n <= passageCount);
}
