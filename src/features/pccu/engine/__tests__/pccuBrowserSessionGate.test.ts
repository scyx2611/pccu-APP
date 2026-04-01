import { pccuBrowserSessionGate } from '../pccuBrowserSessionGate';

describe('pccuBrowserSessionGate', () => {
  beforeEach(() => {
    pccuBrowserSessionGate.resetForTests();
  });

  afterEach(() => {
    pccuBrowserSessionGate.resetForTests();
  });

  it('serializes PCCU session ownership until the current owner releases', async () => {
    const firstLease = await pccuBrowserSessionGate.acquire('tutoring');
    let secondAcquired = false;

    const secondLeasePromise = pccuBrowserSessionGate.acquire('schedule').then((lease) => {
      secondAcquired = true;
      return lease;
    });

    await Promise.resolve();

    expect(pccuBrowserSessionGate.getCurrentOwner()).toBe('tutoring');
    expect(pccuBrowserSessionGate.getQueueLength()).toBe(1);
    expect(secondAcquired).toBe(false);

    firstLease.release();

    const secondLease = await secondLeasePromise;
    expect(secondAcquired).toBe(true);
    expect(pccuBrowserSessionGate.getCurrentOwner()).toBe('schedule');

    secondLease.release();
    expect(pccuBrowserSessionGate.isLocked()).toBe(false);
  });
});
