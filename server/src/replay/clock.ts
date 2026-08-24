export class ReplayClock {
  private current: Date | null = null;

  now(): Date | null {
    return this.current ? new Date(this.current) : null;
  }

  async advanceTo(next: Date, speed: number): Promise<void> {
    if (!Number.isFinite(speed) || speed < 0) throw new Error('Replay speed must be non-negative');
    if (this.current && next.getTime() < this.current.getTime()) {
      throw new Error('Replay clock cannot move backwards');
    }
    if (this.current && speed > 0) {
      const delay = (next.getTime() - this.current.getTime()) / speed;
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    }
    this.current = new Date(next);
  }
}
