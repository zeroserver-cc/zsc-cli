import { GraphQLError } from '../../../infrastructure/graphql/client';
import { handleError } from '../errors';

describe('handleError', () => {
  let errorSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  function printedErrors(): string {
    return errorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
  }

  it('translates a GraphQL schema mismatch into a backend-upgrade message', () => {
    expect(() =>
      handleError(new GraphQLError('Cannot query field "searchHfModels" on type "Query".'))
    ).toThrow('process.exit(1)');

    const errors = printedErrors();
    expect(errors).toContain('requires a newer ZeroServer backend');
    expect(errors).not.toContain('Cannot query field');
  });

  it('translates a missing field on a type the same way', () => {
    expect(() =>
      handleError(new GraphQLError('Cannot query field "curated" on type "AiModel".'))
    ).toThrow('process.exit(1)');

    expect(printedErrors()).toContain('requires a newer ZeroServer backend');
  });

  it('caps long backend messages at 500 chars with an ellipsis', () => {
    const long = 'x'.repeat(600);

    expect(() => handleError(new Error(long))).toThrow('process.exit(1)');

    const errors = printedErrors();
    expect(errors).toContain(`${'x'.repeat(500)}...`);
    expect(errors).not.toContain('x'.repeat(501));
  });

  it('prints short messages untouched', () => {
    expect(() => handleError(new GraphQLError('No eligible node'))).toThrow('process.exit(1)');

    expect(printedErrors()).toContain('No eligible node');
  });
});
