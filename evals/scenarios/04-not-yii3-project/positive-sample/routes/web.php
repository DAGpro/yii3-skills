<?php

use Illuminate\Support\Facades\Route;

Route::get('/', fn () => view('welcome'));
Route::get('/health', fn () => response()->json(['status' => 'ok']));
