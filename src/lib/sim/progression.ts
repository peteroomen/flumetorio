// Company-letter progression. The town's first valve (the blacksmith) is the finale.
// Each letter grants building drawings on completion; the last one is the win condition.

import type { BuildingKind, Letter } from './types';

export function initialLetters(): Letter[] {
  return [
    {
      id: 'l1_planks',
      title: 'Concession granted',
      body: 'The Company grants you this valley. Fell timber (E), build a pit saw to cut planks, and ship 8 planks to the Company Wharf (carry them there and press Q). Drawings for a water-powered sawmill will follow.',
      wantResource: 'plank',
      wantCount: 8,
      sink: 'company',
      unlocks: ['waterwheel', 'sawmill'],
      done: false,
    },
    {
      id: 'l2_flume',
      title: 'On automation',
      body: 'Carrying is beneath a going concern. Ship 20 planks to the Wharf; the Company will send flume drawings so timber rides itself downhill. (Building costs materials too — keep a plank chest by your works.)',
      wantResource: 'plank',
      wantCount: 20,
      sink: 'company',
      unlocks: ['flumeHead', 'flume'],
      done: false,
    },
    {
      id: 'l3_iron_works',
      title: 'Iron ambitions',
      body: 'The valley has ore. Ship 30 planks to the Wharf and receive drawings for a charcoal clamp, a gravity incline, and a blast furnace.',
      wantResource: 'plank',
      wantCount: 30,
      sink: 'company',
      unlocks: ['clamp', 'incline', 'furnace'],
      done: false,
    },
    {
      id: 'l4_blacksmith',
      title: 'The blacksmith has opened',
      body: 'A smith has taken premises down-valley. Build a Blacksmith (press 0) and supply it 10 iron — carry iron there (Q), or set a chest beside it and it draws iron from the chest. The town is then begun.',
      wantResource: 'iron',
      wantCount: 10,
      sink: 'blacksmith',
      unlocks: [],
      done: false,
    },
  ];
}

export function allUnlocksFor(letters: Letter[]): BuildingKind[] {
  const set = new Set<BuildingKind>(['stockpile', 'pitsaw', 'blacksmith']);
  for (const l of letters) if (l.done) for (const u of l.unlocks) set.add(u);
  return [...set];
}
