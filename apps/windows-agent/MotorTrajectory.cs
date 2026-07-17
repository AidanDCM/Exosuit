namespace Exosuit.Agent;

public static class MotorTrajectory
{
    public static IReadOnlyList<Point> CubicBezier(
        Point start,
        Point end,
        int steps,
        double bend = 0.18)
    {
        if (steps < 2) throw new ArgumentOutOfRangeException(nameof(steps), "At least two trajectory steps are required.");
        if (!double.IsFinite(start.X) || !double.IsFinite(start.Y) || !double.IsFinite(end.X) || !double.IsFinite(end.Y))
            throw new ArgumentException("Trajectory coordinates must be finite.");
        bend = Math.Clamp(bend, -0.5, 0.5);

        var dx = end.X - start.X;
        var dy = end.Y - start.Y;
        var distance = Math.Sqrt(dx * dx + dy * dy);
        var normalX = distance == 0 ? 0 : -dy / distance;
        var normalY = distance == 0 ? 0 : dx / distance;
        var offset = Math.Min(distance * Math.Abs(bend), 120);
        var direction = Math.Sign(bend);
        var control1 = new Point(
            start.X + dx * 0.33 + normalX * offset * direction,
            start.Y + dy * 0.33 + normalY * offset * direction);
        var control2 = new Point(
            start.X + dx * 0.67 + normalX * offset * direction,
            start.Y + dy * 0.67 + normalY * offset * direction);

        var result = new Point[steps];
        for (var index = 0; index < steps; index++)
        {
            var t = index / (double)(steps - 1);
            var eased = SmoothStep(t);
            var inverse = 1 - eased;
            result[index] = new Point(
                inverse * inverse * inverse * start.X +
                3 * inverse * inverse * eased * control1.X +
                3 * inverse * eased * eased * control2.X +
                eased * eased * eased * end.X,
                inverse * inverse * inverse * start.Y +
                3 * inverse * inverse * eased * control1.Y +
                3 * inverse * eased * eased * control2.Y +
                eased * eased * eased * end.Y);
        }
        result[0] = start;
        result[^1] = end;
        return result;
    }

    private static double SmoothStep(double value) => value * value * (3 - 2 * value);
}
