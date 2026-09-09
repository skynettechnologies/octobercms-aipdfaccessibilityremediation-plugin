<?php

use SkynetTechnologies\AiPdfAccessibilityRemediation\Classes\ApiClient;

/**
 * Session endpoint for the frontend component.
 *
 * The backend workspace uses the controller action instead
 * (skynettechnologies/aipdfaccessibilityremediation/documents/session), which October already
 * protects with backend auth and the plugin's own permission check.
 *
 * This route is the frontend equivalent, and it is deliberately guarded: it
 * mints a session for the account, so leaving it open would be no better than
 * shipping the auth code to the browser. A caller must be signed in — as a
 * backend user, or as a frontend user when a user plugin provides them.
 */
Route::post('aipdfaccessibilityremediation/session', function () {
    if (!\SkynetTechnologies\AiPdfAccessibilityRemediation\Classes\ApiClient::callerIsAuthenticated()) {
        return response()->json(['error' => 'Authentication required.'], 401);
    }

    try {
        return response()->json((new ApiClient())->createSession());
    }
    catch (\Exception $ex) {
        return response()->json(['error' => $ex->getMessage()], 422);
    }
})->middleware('web')->name('pdfremediation.session');
