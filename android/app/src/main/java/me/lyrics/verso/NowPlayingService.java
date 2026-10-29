package me.lyrics.verso;

import android.service.notification.NotificationListenerService;

/**
 * Service vide : son activation (Réglages Android → Accès aux notifications) autorise Verso
 * à lire le titre en cours de lecture dans les autres applications (Spotify, YouTube Music…).
 * Verso ne lit ni ne conserve aucune notification.
 */
public class NowPlayingService extends NotificationListenerService { }
