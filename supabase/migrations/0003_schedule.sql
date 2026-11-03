-- Heads Up Home: switch on the automatic schedule.
-- Run this last, after both functions are deployed and the vault secrets exist.

-- Every hour at 7 minutes past (avoids the on-the-hour rush on government servers).
select cron.schedule('collect-recalls-hourly', '7 * * * *', $$ select public.call_function('collect-recalls') $$);

-- Daily summary for people who chose it. Times are UTC: 07:00 UTC is 8am in summer, 7am in winter.
select cron.schedule('daily-digest', '0 7 * * *', $$ select public.call_function('daily-digest') $$);
