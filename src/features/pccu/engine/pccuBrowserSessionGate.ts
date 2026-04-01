export interface PccuBrowserSessionLease {
  owner: string;
  release: () => void;
}

type Waiter = {
  owner: string;
  resolve: (lease: PccuBrowserSessionLease) => void;
};

class PccuBrowserSessionGate {
  private activeOwner: string | null = null;
  private activeToken = 0;
  private queue: Waiter[] = [];

  acquire(owner: string): Promise<PccuBrowserSessionLease> {
    if (!this.activeOwner) {
      return Promise.resolve(this.activate(owner));
    }

    return new Promise((resolve) => {
      this.queue.push({ owner, resolve });
    });
  }

  isLocked(): boolean {
    return this.activeOwner !== null;
  }

  getCurrentOwner(): string | null {
    return this.activeOwner;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  resetForTests(): void {
    this.activeOwner = null;
    this.activeToken = 0;
    this.queue = [];
  }

  private activate(owner: string): PccuBrowserSessionLease {
    this.activeOwner = owner;
    const token = ++this.activeToken;
    let released = false;

    return {
      owner,
      release: () => {
        if (released) {
          return;
        }
        released = true;

        if (this.activeOwner !== owner || this.activeToken !== token) {
          return;
        }

        this.activeOwner = null;
        this.grantNext();
      },
    };
  }

  private grantNext(): void {
    if (this.activeOwner || this.queue.length === 0) {
      return;
    }

    const next = this.queue.shift();
    if (!next) {
      return;
    }

    next.resolve(this.activate(next.owner));
  }
}

export const pccuBrowserSessionGate = new PccuBrowserSessionGate();
