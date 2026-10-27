on run argv
	if (count of argv) < 10 then error "usage: osascript apple-calendar-event.applescript <calendar> <title> <year> <month> <day> <hour> <minute> <duration-minutes> <alert-minutes-csv> <description>"

	set calendarName to item 1 of argv
	set eventTitle to item 2 of argv
	set eventYear to (item 3 of argv) as integer
	set eventMonth to (item 4 of argv) as integer
	set eventDay to (item 5 of argv) as integer
	set eventHour to (item 6 of argv) as integer
	set eventMinute to (item 7 of argv) as integer
	set durationMinutes to (item 8 of argv) as integer
	set alertMinutesCSV to item 9 of argv
	set eventDescription to item 10 of argv

	if eventTitle is "" then error "event title must not be empty"
	if durationMinutes ≤ 0 then error "duration must be greater than 0"

	set startTime to current date
	set year of startTime to eventYear
	set month of startTime to eventMonth
	set day of startTime to eventDay
	set hours of startTime to eventHour
	set minutes of startTime to eventMinute
	set seconds of startTime to 0
	set endTime to startTime + (durationMinutes * 60)

	tell application "Calendar"
		if not (exists calendar calendarName) then error "calendar not found: " & calendarName
		set targetCalendar to calendar calendarName

		set duplicates to every event of targetCalendar whose summary is eventTitle and start date is startTime
		if (count of duplicates) > 0 then
			set existingEvent to item 1 of duplicates
			return "duplicate|" & (uid of existingEvent) & "|" & eventTitle
		end if

		set createdEvent to make new event at end of events of targetCalendar with properties {summary:eventTitle, start date:startTime, end date:endTime, description:eventDescription}

		if alertMinutesCSV is not "" then
			set oldDelimiters to AppleScript's text item delimiters
			set AppleScript's text item delimiters to ","
			set alertMinutesList to text items of alertMinutesCSV
			set AppleScript's text item delimiters to oldDelimiters

			repeat with alertMinutesText in alertMinutesList
				set alertMinutes to alertMinutesText as integer
				make new display alarm at end of display alarms of createdEvent with properties {trigger interval:(0 - alertMinutes)}
			end repeat
		end if

		set createdUID to uid of createdEvent
		set verifiedEvents to every event of targetCalendar whose uid is createdUID
		if (count of verifiedEvents) is not 1 then error "verification failed for uid: " & createdUID
		return "created|" & createdUID & "|" & eventTitle
	end tell
end run
