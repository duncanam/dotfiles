# Set the touchpad settings, check to make sure we are on the XPS:
if [ "$HOSTNAME" = kali ]; then
	xinput set-prop "DELL07E6:00 06CB:76AF Touchpad" "libinput Click Method Enabled" 0 1
	xinput set-prop "DELL07E6:00 06CB:76AF Touchpad" "libinput Tapping Enabled" 1
	xinput set-prop "DELL07E6:00 06CB:76AF Touchpad" "libinput Natural Scrolling Enabled" 1
fi

# Start GNOME keyring for wifi and VPN password storage
#eval $(/usr/bin/gnome-keyring-daemon --start --components=pkcs11,secrets,ssh)
#export SSH_AUTH_SOCK
#eval $(/usr/bin/gnome-keyring-daemon --start --components=gpg,pkcs11,secrets,ssh)
#export $(gnome-keyring-daemon --start --components=pkcs11,secrets,ssh,gpg)
#dbus-update-activation-environment --systemd DISPLAY

# Reload .Xresources to be safe 
# DISABLED SINCE i3 DOES THIS
#exec xrdb .Xresources 

# Start i3-gaps:
exec i3


