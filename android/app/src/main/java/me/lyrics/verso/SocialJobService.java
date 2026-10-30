package me.lyrics.verso;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** Vérification périodique (15 min) des demandes d'ami et messages, même Verso fermé. */
public class SocialJobService extends JobService {
    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> { SocialPoller.poll(this); jobFinished(params, false); }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) { return true; }
}
