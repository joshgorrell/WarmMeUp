// Regression matrix for notify-partner notification copy.
// Kept dependency-free so the expected privacy contract is obvious during review.

type Case = { discreet: boolean; event: string; media?: 'photo' | 'video' | 'gif'; expected: string };

const cases: Case[] = [
  { discreet: true, event: 'new_message', expected: 'New Activity' },
  { discreet: true, event: 'new_dare', expected: 'New Activity' },
  { discreet: true, event: 'new_wish', expected: 'New Activity' },
  { discreet: false, event: 'new_message', expected: 'New Message' },
  { discreet: false, event: 'new_message', media: 'photo', expected: 'New Picture' },
  { discreet: false, event: 'new_message', media: 'video', expected: 'New Video' },
  { discreet: false, event: 'new_message', media: 'gif', expected: 'New GIF' },
  { discreet: false, event: 'new_dare', expected: 'New Dare' },
  { discreet: false, event: 'new_wish', expected: 'New Wish' },
  { discreet: false, event: 'dice_roll', expected: 'New Activity' },
];

export const discreetNotificationRegressionMatrix = cases;
