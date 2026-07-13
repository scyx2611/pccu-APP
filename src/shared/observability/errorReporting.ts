import { createLogger } from './logger';

export type BoundaryErrorEvent = Readonly<{
  errorName: string;
  boundary: string;
  retryCount: number;
}>;

const logger = createLogger('error-boundary');

export const reportBoundaryError = (event: BoundaryErrorEvent): void => {
  logger.error('react_boundary_caught', event);
};
