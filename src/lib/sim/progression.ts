// Company-letter progression. The town's first valve (the blacksmith) is the finale.
// Each letter grants building drawings on completion; the last one is the win condition.

import type { BuildingKind, Letter } from './types';

export function initialLetters(): Letter[] {
  return [
    {
      id: 'l1_planks',
      title: 'Concession granted',
      body: 'The Company grants you this valley. Cut timber, saw planks, and deliver 8 planks to prove the works. Drawings for a waterwheel and sawmill will follow.',
      wantResource: 'plank',
      wantCount: 8,
      sink: 'company',
      unlocks: ['waterwheel', 'sawmill'],
      done: false,
    },
    {
      id: 'l2_flume',
      title: 'On automation',
      body: 'Carrying is beneath a going concern. Deliver 20 planks; the Company will send flume drawings so timber rides itself downhill.',
      wantResource: 'plank',
      wantCount: 20,
      sink: 'company',
      unlocks: ['flumeHead', 'flume'],
      done: false,
    },
    {
      id: 'l3_iron_works',
      title: 'Iron ambitions',
      body: 'The valley has ore. Deliver 30 planks and receive drawings for a charcoal clamp, a gravity incline, and a blast furnace.',
      wantResource: 'plank',
      wantCount: 30,
      sink: 'company',
      unlocks: ['clamp', 'incline', 'furnace'],
      done: false,
    },
    {
      id: 'l4_blacksmith',
      title: 'The blacksmith has opened',
      body: 'A smith has taken premises down-valley. He wants iron — deliver 10 pigs of iron to his door and the town is truly begun.',
      wantResource: 'iron',
      wantCount: 10,
      sink: 'blacksmith',
      unlocks: [],
      done: false,
    },
  ];
}

export function allUnlocksFor(letters: Letter[]): BuildingKind[] {
  const set = new Set<BuildingKind>(['stockpile', 'blacksmith']);
  for (const l of letters) if (l.done) for (const u of l.unlocks) set.add(u);
  return [...set];
}
