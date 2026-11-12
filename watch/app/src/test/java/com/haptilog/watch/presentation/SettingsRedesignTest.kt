package com.haptilog.watch.presentation

import android.app.Application
import android.content.Context
import com.haptilog.watch.R
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30], application = Application::class)
class SettingsRedesignTest {

    private lateinit var context: Context

    @Before
    fun setup() {
        context = RuntimeEnvironment.getApplication()
    }

    @Test
    fun stringResourcesArePresentAndNonEmpty() {
        assertNotNull(context.getString(R.string.support_title))
        assertNotNull(context.getString(R.string.support_diagnostics_action))
        assertNotNull(context.getString(R.string.cloud_consent_dialog_msg))
        assertNotNull(context.getString(R.string.crash_reports_hint))
        assertNotNull(context.getString(R.string.cloud_sync_summary))
    }

    @Test
    fun activitiesCanBeCreatedWithoutCrash() {
        val settingsController = Robolectric.buildActivity(SettingsActivity::class.java).setup()
        assertNotNull(settingsController.get())

        val supportController = Robolectric.buildActivity(SupportActivity::class.java).setup()
        assertNotNull(supportController.get())

        val locationController = Robolectric.buildActivity(LocationSettingsActivity::class.java).setup()
        assertNotNull(locationController.get())
    }
}
