package com.haptilog.watch.presentation

import android.app.Application
import android.content.Context
import android.content.res.Configuration
import com.haptilog.watch.R
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.util.Locale

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30], application = Application::class)
class CompactMetadataTest {
    private fun context(language: String): Context {
        val app = RuntimeEnvironment.getApplication()
        return app.createConfigurationContext(Configuration(app.resources.configuration).apply {
            setLocale(Locale.forLanguageTag(language))
        })
    }

    @Test fun durationKeepsUnitsAttachedAndPreservesRemainingSeconds() {
        val ko = context("ko")
        assertEquals("1분\u00a023초", recordingDuration(ko, 83))
        assertEquals("1분", recordingDuration(ko, 60))
        assertEquals("12초", recordingDuration(ko, 12))
        assertEquals("0초", recordingDuration(ko, -1))
        val en = context("en")
        assertEquals("1\u00a0min\u00a023\u00a0s", recordingDuration(en, 83))
    }

    @Test fun unknownClassificationStaysNeutralInsteadOfGuessingFromOtherData() {
        assertEquals(categoryStyle(null), categoryStyle("UNRECOGNIZED"))
        assertEquals(R.drawable.ic_mic, categoryStyle(null).icon)
        assertEquals(context("ko").getString(R.string.category_pending), categoryLabel(context("ko"), null))
    }
}
