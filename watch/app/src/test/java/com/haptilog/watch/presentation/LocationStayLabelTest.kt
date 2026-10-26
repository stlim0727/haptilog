package com.haptilog.watch.presentation

import com.haptilog.watch.data.location.LocationStay
import com.haptilog.watch.data.location.SavedPlace
import org.junit.Assert.*
import org.junit.Test

class LocationStayLabelTest {
    private fun stay(latitude: Double, longitude: Double, accuracy: Float = 10f) = LocationStay(
        id = "stay-1", sessionId = "session-1", startedAtMillis = 0, qualifiedAtMillis = 0,
        lastObservedAtMillis = 0, observedDurationMillis = 600_000,
        representativeLatitude = latitude, representativeLongitude = longitude, accuracyMeters = accuracy,
    )

    private val home = SavedPlace("home", "Home", 37.0, 127.0, 200.0)
    private val cafe = SavedPlace("cafe", "Cafe", 37.5, 127.5, 200.0)

    @Test fun stayInsideOnePlaceIsNamedAfterIt() {
        assertEquals("Home", stayPlaceName(stay(37.0, 127.0), listOf(home, cafe)))
    }

    @Test fun stayOutsideEveryPlaceStaysUnnamed() {
        assertNull(stayPlaceName(stay(36.0, 126.0), listOf(home, cafe)))
    }

    @Test fun ambiguousCoordinateInsideTwoPlacesIsNotNamed() {
        val alsoHere = SavedPlace("also", "Corner block", 37.0005, 127.0005, 200.0)
        assertNull(stayPlaceName(stay(37.0, 127.0), listOf(home, alsoHere)))
    }

    @Test fun accuracyRadiusCountsAgainstContainment() {
        // 250 m from the centre of a 200 m area, plus a 10 m error, is not inside it.
        assertNull(stayPlaceName(stay(37.00225, 127.0), listOf(home)))
    }
}
