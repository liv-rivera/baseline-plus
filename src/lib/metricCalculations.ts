import { DailyMetrics, Averages, Changes, Trends } from "@/types/metrics";

// Sort daily metrics with insertion sort algorithm
export function sortMetrics(values: DailyMetrics[]) {
    // Loop from the second element up to the last element
    for ( let i = 0; i < values.length; i++){
        const key = values[i];
        let j = i - 1;
        
        // Move elements of values[0..i-1] that are greater than key to one position ahead of their current position
        while ( j >= 0 && values[j].date > key.date) {
            values[j + 1] = values[j]
            j -= 1
        }   
        // Place the key at its correct position
        values[j + 1] = key
    }
    return values
}

type MetricKey = "steps" | "moveCalories" | "restMinutes" | "breatheMinutes";

// Compares the two most recent days that recorded each metric, so a day with
// steps but no sleep data doesn't wipe out the rest trend.
export function calculateTrend(values: DailyMetrics[]): Trends {
    const sortedValues = sortMetrics([...values]);
    const trendFor = (key: MetricKey) => {
        const observed = sortedValues.flatMap((record) => record[key] === null ? [] : [record[key]]);
        return observed.length < 2 ? null : observed[observed.length - 1] - observed[observed.length - 2];
    };

    return {
        steps: trendFor("steps"),
        moveCalories: trendFor("moveCalories"),
        restMinutes: trendFor("restMinutes"),
        breatheMinutes: trendFor("breatheMinutes"),
    };
}

export function calculateChange(trend: Averages, today: DailyMetrics) {
    const changeFor = (key: MetricKey) => {
        const value = today[key];
        return value === null ? null : Math.floor(value - trend[key]);
    };

    // Calculate and format changes based on today and trends
    const result: Changes = {
        steps: changeFor("steps"),
        moveCalories: changeFor("moveCalories"),
        restMinutes: changeFor("restMinutes"),
        breatheMinutes: changeFor("breatheMinutes"),
    };

    return result;
};
