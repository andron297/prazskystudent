import { describe, expect, it } from 'vitest';
import { easterSunday, nameDay, nameDayText, publicHoliday } from '../lib/czechDays';

describe('český kalendář', () => {
  it('jmeniny', () => {
    expect(nameDay(new Date(2026, 0, 2))).toEqual(['Karina']);
    expect(nameDayText(new Date(2026, 11, 24))).toBe('Svátek mají Adam a Eva');
    expect(nameDayText(new Date(2026, 2, 19))).toBe('Svátek mají Josef a Josefa');
    expect(nameDay(new Date(2026, 0, 1))).toEqual([]);
  });
  it('státní svátky včetně Velikonoc', () => {
    expect(easterSunday(2026).toDateString()).toBe(new Date(2026, 3, 5).toDateString());
    expect(easterSunday(2027).toDateString()).toBe(new Date(2027, 2, 28).toDateString());
    expect(publicHoliday(new Date(2026, 3, 3))).toBe('Velký pátek');
    expect(publicHoliday(new Date(2026, 3, 6))).toBe('Velikonoční pondělí');
    expect(publicHoliday(new Date(2026, 10, 17))).toMatch(/studentstva/);
    expect(publicHoliday(new Date(2026, 10, 18))).toBeNull();
  });
});
