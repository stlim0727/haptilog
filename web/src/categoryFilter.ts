/** Leaf types are disjoint. Voice is a parent chip for every voice type. */
export const JOURNAL_CATEGORIES = ['Voice', 'Stay', 'Expense', 'Travel', 'Workout', 'Memo'] as const;
export const VOICE_CATEGORIES = JOURNAL_CATEGORIES.filter(key => key !== 'Stay');
export function categorySelection(category: string): string[] {
  return category === 'All' ? [...JOURNAL_CATEGORIES] : category === 'Voice' ? [...VOICE_CATEGORIES] : [category];
}
export function categoryPressed(selected: readonly string[], category: string): boolean | 'mixed' {
  const keys = category === 'All' ? JOURNAL_CATEGORIES : category === 'Voice' ? VOICE_CATEGORIES : [category];
  const count = keys.filter(key => selected.includes(key)).length;
  return count === keys.length ? true : count > 0 && category === 'Voice' ? 'mixed' : false;
}
export function toggleCategory(selected: readonly string[], category: string): string[] {
  if (category === 'All') return [...JOURNAL_CATEGORIES];
  const keys = category === 'Voice' ? VOICE_CATEGORIES : [category];
  const remove = keys.every(key => selected.includes(key));
  return JOURNAL_CATEGORIES.filter(key => remove ? selected.includes(key) && !keys.includes(key) : selected.includes(key) || keys.includes(key));
}
