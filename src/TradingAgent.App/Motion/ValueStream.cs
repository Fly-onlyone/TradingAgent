namespace TradingAgent.App.Motion;

/// <summary>
/// A value an animation pushes into a control's property every frame. Binding a property to it once
/// is cheaper than setting the property anew each frame, and needs no reflection.
/// </summary>
internal sealed class ValueStream<T>(T initial) : IObservable<T>
{
    private readonly List<IObserver<T>> _observers = [];
    private T _value = initial;

    public void Set(T value)
    {
        _value = value;
        foreach (var observer in _observers.ToArray())
        {
            observer.OnNext(value);
        }
    }

    public IDisposable Subscribe(IObserver<T> observer)
    {
        _observers.Add(observer);
        observer.OnNext(_value);
        return new Subscription(this, observer);
    }

    private sealed class Subscription(ValueStream<T> stream, IObserver<T> observer) : IDisposable
    {
        public void Dispose() => stream._observers.Remove(observer);
    }
}
