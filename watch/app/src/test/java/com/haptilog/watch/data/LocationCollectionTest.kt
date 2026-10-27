package com.haptilog.watch.data

import com.haptilog.watch.data.location.LocationCollection
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class LocationCollectionTest {
    @Test fun legacyDurationNeverStartsCollectionAndDefaultsToRecordingOnly() {
        val context = RuntimeEnvironment.getApplication()
        val prefs = context.getSharedPreferences("location_collection", 0)
        for (duration in listOf("EIGHT_HOURS", "TWENTY_FOUR_HOURS", "CONTINUOUS")) {
            prefs.edit().clear().putString("duration", duration).commit()
            assertEquals(LocationCollection.RECORDING_ONLY, LocationCollection.load(context))
        }
        LocationCollection.save(context, LocationCollection.OFF)
        assertFalse(LocationCollection.load(context).includesRecordings)
        assertFalse(prefs.contains("duration"))
        LocationCollection.save(context, LocationCollection.INCLUDING_NON_RECORDING)
        assertTrue(LocationCollection.load(context).includesRecordings)
    }
}
