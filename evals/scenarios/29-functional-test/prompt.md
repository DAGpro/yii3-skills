We have an API endpoint but no functional tests for it. Set up the functional test suite for this project (Codeception 5 with yiisoft/yii-testing) and add a functional test for `GET /api/status` that asserts the HTTP 200 status and the JSON body `{"status": "ok"}`.

The functional test must exercise the application in-memory - no live web server, no raw HTTP calls to localhost.
