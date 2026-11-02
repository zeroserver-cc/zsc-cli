import {
  InvalidAmountError,
  assertAmountWithinLimits,
  brlToCents,
  formatBrl,
  formatSignedBrl,
  parseReaisToCents
} from '../money';

describe('parseReaisToCents', () => {
  it.each([
    ['10', 1000],
    ['50', 5000],
    ['50.00', 5000],
    ['50,00', 5000],
    ['10.5', 1050],
    ['10,5', 1050],
    ['10,50', 1050],
    ['0,05', 5],
    ['0.5', 50],
    ['0', 0],
    ['  25  ', 2500],
    ['R$ 50,00', 5000],
    ['r$50', 5000],
    ['1.234,56', 123456],
    ['1,234.56', 123456],
    ['12.345.678,90', 1234567890]
  ])('parses %s as %i cents', (input, cents) => {
    expect(parseReaisToCents(input)).toBe(cents);
  });

  it('never goes through float multiplication', () => {
    // 19.99 * 100 === 1998.9999999999998 in IEEE 754
    expect(parseReaisToCents('19.99')).toBe(1999);
    expect(parseReaisToCents('0.29')).toBe(29);
    expect(parseReaisToCents('1.15')).toBe(115);
  });

  it.each(['-5', '-0,50', ' -10'])('rejects negative amount %s', (input) => {
    expect(() => parseReaisToCents(input)).toThrow(/greater than zero/);
  });

  it.each(['', '   ', 'R$'])('rejects empty input %p', (input) => {
    expect(() => parseReaisToCents(input)).toThrow(InvalidAmountError);
  });

  it.each(['10.123', '10,1234', '0.001', '1.234,567'])(
    'rejects more than two decimal places in %s',
    (input) => {
      expect(() => parseReaisToCents(input)).toThrow(InvalidAmountError);
    }
  );

  it.each(['1.234', '1,234', '1.234.567'])('rejects ambiguous thousands/decimal %s', (input) => {
    expect(() => parseReaisToCents(input)).toThrow(/Ambiguous/);
  });

  it.each(['abc', '10 reais', '1e3', '10,', ',50', '1..5', '1.2.3', '0x10', '1,2,3,4'])(
    'rejects malformed input %s',
    (input) => {
      expect(() => parseReaisToCents(input)).toThrow(InvalidAmountError);
    }
  );

  it('rejects absurdly large amounts instead of losing precision', () => {
    expect(() => parseReaisToCents('99999999999999999999')).toThrow(/too large/);
  });
});

describe('assertAmountWithinLimits', () => {
  const limits = { minCents: 1000, maxCents: 100000 };

  it('accepts the boundaries', () => {
    expect(() => assertAmountWithinLimits(1000, limits)).not.toThrow();
    expect(() => assertAmountWithinLimits(100000, limits)).not.toThrow();
  });

  it('rejects below the minimum and above the maximum with the limits in the message', () => {
    expect(() => assertAmountWithinLimits(999, limits)).toThrow(
      'Amount must be between R$ 10,00 and R$ 1.000,00.'
    );
    expect(() => assertAmountWithinLimits(100001, limits)).toThrow(/between/);
  });

  it.each([0, -100, 1.5, NaN])('rejects non-positive or non-integer %p', (value) => {
    expect(() => assertAmountWithinLimits(value, limits)).toThrow(/greater than zero/);
  });
});

describe('formatting', () => {
  it('formats cents as BRL with pt-BR separators', () => {
    expect(formatBrl(0)).toBe('R$ 0,00');
    expect(formatBrl(5)).toBe('R$ 0,05');
    expect(formatBrl(5000)).toBe('R$ 50,00');
    expect(formatBrl(123456)).toBe('R$ 1.234,56');
    expect(formatBrl(-1050)).toBe('-R$ 10,50');
  });

  it('always shows the sign in ledger amounts', () => {
    expect(formatSignedBrl(5000)).toBe('+R$ 50,00');
    expect(formatSignedBrl(-5000)).toBe('-R$ 50,00');
  });

  it('converts derived BRL floats to cents', () => {
    expect(brlToCents(19.99)).toBe(1999);
    expect(brlToCents(0.29)).toBe(29);
  });
});
