import { describe, expect, it } from 'vitest';
import {
  absencesCaption,
  activeDriversCaption,
  activePassengersCaption,
  activeRoutesCaption,
  activeVehiclesCaption,
  boardedCaption,
  totalTrips,
  trackingCaption,
  tripsCaption,
} from './dashboard-captions';

const day = {
  scheduledTrips: 2,
  readyTrips: 1,
  startedTrips: 3,
  completedTrips: 4,
  cancelledTrips: 0,
};

describe('dashboard captions', () => {
  describe('trackingCaption', () => {
    it('names each reporting state that has buses in it', () => {
      expect(
        trackingCaption({ liveVehicles: 3, staleVehicles: 1, offlineVehicles: 0 }, 4),
      ).toBe('3 live · 1 stale');
    });

    it('separates a quiet night from a fleet that has gone dark', () => {
      // The distinction that matters. One caption for both would raise an alarm every night and
      // hide a real one during the day.
      expect(trackingCaption({ liveVehicles: 0, staleVehicles: 0, offlineVehicles: 0 }, 0)).toBe(
        'No trips under way',
      );
      expect(trackingCaption({ liveVehicles: 0, staleVehicles: 0, offlineVehicles: 0 }, 2)).toBe(
        'Nothing reporting',
      );
    });

    it('says nothing at all when there is no summary yet', () => {
      expect(trackingCaption(null, null)).toBeNull();
    });
  });

  describe('tripsCaption', () => {
    it('reports completions against a day that has trips', () => {
      expect(tripsCaption(day)).toBe('4 completed');
    });

    it('mentions cancellations, because they are why the count is short', () => {
      expect(tripsCaption({ ...day, cancelledTrips: 2 })).toBe('4 completed · 2 cancelled');
    });

    it('does not say "0 completed" for a day with nothing scheduled', () => {
      expect(
        tripsCaption({
          scheduledTrips: 0,
          readyTrips: 0,
          startedTrips: 0,
          completedTrips: 0,
          cancelledTrips: 0,
        }),
      ).toBe('Nothing scheduled today');
    });
  });

  it('totals every trip state, including the cancelled ones', () => {
    expect(totalTrips(day)).toBe(10);
  });

  describe('boardedCaption', () => {
    it('gives the denominator when there is one', () => {
      expect(boardedCaption({ expected: 24, boarded: 9, noShow: 0, skipped: 0 })).toBe(
        'of 24 expected',
      );
    });

    it('refuses to print "of 0 expected", which makes the number above it meaningless', () => {
      expect(boardedCaption({ expected: 0, boarded: 0, noShow: 0, skipped: 0 })).toBe(
        'Nobody is due to travel',
      );
    });
  });

  describe('absencesCaption', () => {
    it('never denies a no-show it is not describing', () => {
      // The regression this exists for: "Nobody missed a pickup" printed under a no-show count of
      // five. The line counts declared absences, and it now says so.
      const caption = absencesCaption({ expected: 24, boarded: 10, noShow: 5, skipped: 0 });

      expect(caption).toBe('No absences declared');
      expect(caption).not.toContain('missed');
    });

    it('counts declared absences, singular and plural', () => {
      expect(absencesCaption({ expected: 24, boarded: 0, noShow: 0, skipped: 1 })).toBe(
        '1 absence declared',
      );
      expect(absencesCaption({ expected: 24, boarded: 0, noShow: 0, skipped: 3 })).toBe(
        '3 absences declared',
      );
    });
  });

  describe('fleet captions', () => {
    it('does not claim empty collections are doing something', () => {
      expect(activeRoutesCaption(0)).toBe('None active yet');
      expect(activeDriversCaption(0)).toBe('None cleared to drive');
      expect(activeVehiclesCaption(0)).toBe('None in service');
      expect(activePassengersCaption(0)).toBe('Nobody enrolled yet');
    });

    it('describes what the number is rather than what it implies', () => {
      // "Available to assign" was wrong for every driver already out on a trip.
      expect(activeDriversCaption(6)).toBe('Cleared to drive');
      expect(activeRoutesCaption(4)).toBe('In the timetable');
    });
  });
});
