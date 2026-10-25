package com.haptilog.watch.presentation

import org.junit.Assert.*
import org.junit.Test

class LocationPlaceInputTest {
    @Test fun acceptsSignedCoordinatesAndGeographicLimits() {
        assertTrue(validPlaceInput("Home", "37.5", "127.0"))
        assertTrue(validPlaceInput("South", "-90", "-180"))
        assertTrue(validPlaceInput("North", "90", "180"))
    }

    @Test fun rejectsIncompleteAndNonFiniteLocationsBeforeSave() {
        assertFalse(validPlaceInput(" ", "37", "127"))
        assertFalse(validPlaceInput("Home", "", "127"))
        assertFalse(validPlaceInput("Home", "NaN", "127"))
        assertFalse(validPlaceInput("Home", "37", "Infinity"))
        assertFalse(validPlaceInput("Home", "90.01", "127"))
        assertFalse(validPlaceInput("Home", "37", "-180.01"))
        assertFalse(validPlaceInput("a".repeat(41), "37", "127"))
    }
}
