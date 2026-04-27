import {
  getScraperDebugRuntimeState,
  setScraperDebugRuntimeState,
  subscribeScraperDebugRuntimeState,
} from '../scraperDebugPreview';

describe('scraperDebugPreview runtime state', () => {
  it('publishes the latest inline debug runtime state to subscribers', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeScraperDebugRuntimeState(listener);

    setScraperDebugRuntimeState({
      status: 'pccu / schedule / syncing',
      message: 'loadend:syncing:schedule',
      url: 'https://example.com/queryByStudent.asp',
    });

    expect(getScraperDebugRuntimeState()).toEqual({
      status: 'pccu / schedule / syncing',
      message: 'loadend:syncing:schedule',
      url: 'https://example.com/queryByStudent.asp',
    });
    expect(listener).toHaveBeenCalledWith({
      status: 'pccu / schedule / syncing',
      message: 'loadend:syncing:schedule',
      url: 'https://example.com/queryByStudent.asp',
    });

    unsubscribe();
  });
});
