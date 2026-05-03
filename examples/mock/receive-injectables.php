<?php

declare(strict_types=1);

/**
 * Paylock Injectables Receiver (Vanilla PHP)
 *
 * Receives forwarded injectables from the Paylock Frontend SDK.
 * Logs the full payload to a file for debugging.
 *
 * Expected payload example:
 * {
 *   "injectables": [ ... ]
 * }
 */

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'status' => 'error',
        'message' => 'Method Not Allowed. Use POST.'
    ]);
    exit;
}

// Read raw input
$raw = file_get_contents('php://input');

if ($raw === false || trim($raw) === '') {
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => 'Empty request body.'
    ]);
    exit;
}

// Decode JSON safely
$data = json_decode($raw, true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => 'Invalid JSON payload.'
    ]);
    exit;
}

// Build a log entry
$entry = [
    'ts' => gmdate('c'),
    'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
    'ua' => $_SERVER['HTTP_USER_AGENT'] ?? null,
    'content_type' => $_SERVER['CONTENT_TYPE'] ?? null,
    'payload' => $data,
];

// Decide log path (same directory by default)
$logFile = __DIR__ . '/paylock_injectables.log';

// Append JSON line (NDJSON style)
$written = file_put_contents(
    $logFile,
    json_encode($entry, JSON_UNESCAPED_SLASHES) . PHP_EOL,
    FILE_APPEND | LOCK_EX
);

if ($written === false) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Failed to write log file.'
    ]);
    exit;
}

// Optional: show quick summary in response
$injectablesCount = 0;
if (isset($data['injectables']) && is_array($data['injectables'])) {
    $injectablesCount = count($data['injectables']);
}

http_response_code(200);
echo json_encode([
    'status' => 'success',
    'message' => 'Injectables received and logged.',
    'data' => [
        'injectables_count' => $injectablesCount
    ]
]);
