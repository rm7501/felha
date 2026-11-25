import { imposter, whoami, mafia, wyr, mlt, bluff } from './talk.jsx';
import { draw, phone, bomb, cats } from './drawword.jsx';
import { trivia, emoji, codenames, wave, feud } from './quiz.jsx';

export const GAME_LIST = [imposter, whoami, mafia, wyr, mlt, bluff, draw, phone, bomb, cats, trivia, emoji, codenames, wave, feud];
export const GAMES = Object.fromEntries(GAME_LIST.map(g => [g.id, g]));
export const SHELVES = [
  { n: 'سوالف وتصويت', ids: ['imposter', 'whoami', 'mafia', 'wyr', 'mlt', 'bluff'] },
  { n: 'رسم وكلمات', ids: ['draw', 'phone', 'bomb', 'cats'] },
  { n: 'مسابقات وفرق', ids: ['trivia', 'emoji', 'codenames', 'wave', 'feud'] },
];
